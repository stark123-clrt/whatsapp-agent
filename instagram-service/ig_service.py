"""
Service Instagram (non officiel) de Stark Marketing.

Lancé et surveillé par l'appli Next.js (src/lib/instagram.ts). Il écoute uniquement en local
(127.0.0.1) et exige une clé secrète à chaque requête. Il s'appuie sur instagrapi, qui imite
l'application Instagram : connexion, double authentification, messages privés.

Le mot de passe n'est jamais enregistré : seule la session Instagram (jetons) est gardée,
dans IG_DATA_DIR/session.json, pour se reconnecter après un redémarrage.
"""

import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from instagrapi import Client
from instagrapi.exceptions import (
    BadPassword,
    ChallengeRequired,
    FeedbackRequired,
    LoginRequired,
    PleaseWaitFewMinutes,
    TwoFactorRequired,
)

PORT = int(os.environ.get("IG_PORT", "8765"))
TOKEN = os.environ.get("IG_TOKEN", "")
DATA_DIR = Path(os.environ.get("IG_DATA_DIR", "data/instagram"))
PROXY = os.environ.get("IG_PROXY", "").strip()
SESSION = DATA_DIR / "session.json"
ACCOUNT = DATA_DIR / "account.json"

DATA_DIR.mkdir(parents=True, exist_ok=True)

# Un seul client Instagram, utilisé par un seul fil à la fois (instagrapi n'est pas fait pour le parallélisme).
api_lock = threading.Lock()
state_lock = threading.Lock()
state = {"status": "logged_out", "username": None, "fullName": None, "userId": None, "followers": None, "picture": None, "error": None}
client = None
# Pendant une connexion : code demandé par Instagram (double authentification ou vérification).
pending = {"kind": None, "code": None, "event": threading.Event(), "username": None, "password": None}


def set_state(**kw):
    with state_lock:
        before = state["status"]
        state.update(kw)
        after = state["status"]
        err = state.get("error")
    # Journal lisible de chaque étape de connexion (jamais le mot de passe ni les codes).
    if after != before or (kw.get("error") and err):
        detail = f" — {err}" if err and after == "error" else ""
        print(f"[instagram] état : {before} → {after}{detail}", flush=True)


def new_client():
    cl = Client()
    cl.delay_range = [1, 3]  # petites pauses entre les requêtes, comme un humain
    cl.set_locale("fr_FR")
    cl.set_country("FR")
    cl.set_timezone_offset(3600)
    if PROXY:
        cl.set_proxy(PROXY)

    def code_handler(username, choice=None):
        # Instagram envoie un code par e-mail ou SMS : on attend que l'utilisateur le saisisse dans l'appli.
        pending["kind"] = "challenge"
        pending["event"].clear()
        set_state(status="challenge", error=None)
        if not pending["event"].wait(timeout=600):
            return False
        return pending["code"]

    cl.challenge_code_handler = code_handler
    return cl


def save_account(cl):
    info = cl.account_info()
    followers = None
    try:
        followers = cl.user_info(info.pk).follower_count
    except Exception:  # le nombre d'abonnés est un bonus
        pass
    data = {
        "username": info.username,
        "fullName": info.full_name,
        "userId": str(info.pk),
        "followers": followers,
        "picture": str(info.profile_pic_url) if info.profile_pic_url else None,
    }
    ACCOUNT.write_text(json.dumps(data), encoding="utf-8")
    set_state(status="connected", error=None, **data)


def friendly(err):
    if isinstance(err, BadPassword):
        return "Mot de passe incorrect."
    if isinstance(err, PleaseWaitFewMinutes):
        return "Instagram demande de patienter quelques minutes avant de réessayer."
    if isinstance(err, FeedbackRequired):
        return "Instagram a limité ce compte temporairement (trop d'actions). Réessaie plus tard."
    if isinstance(err, ChallengeRequired):
        return "Instagram demande une vérification : ouvre l'application Instagram sur ton téléphone, confirme que c'est toi, puis reconnecte."
    if isinstance(err, LoginRequired):
        return "La session Instagram a expiré : reconnecte le compte."
    text = str(err) or err.__class__.__name__
    if "obsol" in text.lower() or "upgrade" in text.lower() or err.__class__.__name__ == "ClientNeedsUpgradeError":
        return (
            "Instagram a refusé cette connexion pour le moment (fréquent avec un compte tout neuf ou après plusieurs essais "
            "rapprochés). Attends quelques heures avant de réessayer, une seule fois."
        )
    return text[:300]


def do_login(username, password):
    global client
    with api_lock:
        cl = new_client()
        try:
            try:
                cl.login(username, password)
            except TwoFactorRequired:
                # Code de l'application d'authentification ou SMS.
                pending["kind"] = "two_factor"
                pending["event"].clear()
                set_state(status="two_factor", error=None)
                if not pending["event"].wait(timeout=600):
                    raise Exception("Code non saisi à temps : recommence la connexion.")
                cl.login(username, password, verification_code=pending["code"])
            cl.dump_settings(SESSION)
            client = cl
            save_account(cl)
        except Exception as err:  # noqa: BLE001 — on renvoie un message lisible
            client = None
            print(f"[instagram] connexion refusée : {err.__class__.__name__}: {str(err)[:200]}", flush=True)
            set_state(status="error", error=friendly(err))
        finally:
            pending.update(kind=None, code=None, username=None, password=None)


def do_login_session(sessionid):
    """Connexion avec le cookie « sessionid » d'un navigateur déjà connecté à Instagram."""
    global client
    with api_lock:
        cl = new_client()
        try:
            cl.login_by_sessionid(sessionid)
            cl.dump_settings(SESSION)
            client = cl
            save_account(cl)
        except Exception as err:  # noqa: BLE001
            client = None
            set_state(status="error", error="Session refusée : elle est peut-être expirée ou incomplète. Recopie la valeur « sessionid » après t'être reconnecté sur instagram.com. (" + friendly(err)[:120] + ")")


def resume():
    """Au démarrage : reprend la session enregistrée, sans mot de passe."""
    global client
    if not SESSION.exists():
        return
    try:
        cl = new_client()
        cl.load_settings(SESSION)
        cl.account_info()  # vérifie que la session est toujours valable
        client = cl
        if ACCOUNT.exists():
            set_state(status="connected", error=None, **json.loads(ACCOUNT.read_text(encoding="utf-8")))
        else:
            save_account(cl)
    except Exception as err:  # noqa: BLE001
        set_state(status="error", error=friendly(err))


def short_user(u):
    return {"pk": str(u.pk), "username": u.username, "fullName": u.full_name or None, "picture": str(u.profile_pic_url) if u.profile_pic_url else None}


def message_json(m, me):
    label = m.text
    if not label:
        kind = m.item_type or ""
        label = {
            "media": "📷 Photo",
            "raven_media": "📷 Photo éphémère",
            "voice_media": "🎤 Message vocal",
            "clip": "🎬 Reel partagé",
            "media_share": "📎 Publication partagée",
            "story_share": "📎 Story partagée",
            "reel_share": "💬 Réponse à une story",
            "link": "🔗 Lien",
            "like": "❤️",
            "animated_media": "GIF",
        }.get(kind, f"[{kind or 'message'}]")
    # Réponse à une story (ou partage d'une publication) : on garde l'identifiant du contenu visé.
    media_ref = None
    for blob in (m.reel_share, m.story_share, m.raw_xma):
        if not isinstance(blob, dict):
            continue
        media = blob.get("media") if isinstance(blob.get("media"), dict) else {}
        ref = media.get("pk") or media.get("id")
        if ref:
            media_ref = str(ref).split("_")[0]
        if not m.text and isinstance(blob.get("text"), str) and blob.get("text").strip():
            label = blob["text"].strip()
        if media_ref:
            break
    if not media_ref and m.media_share is not None:
        media_ref = str(getattr(m.media_share, "pk", "") or "") or None
    ts = m.timestamp.timestamp() if m.timestamp else time.time()
    return {"id": str(m.id), "userId": str(m.user_id) if m.user_id else None, "fromMe": str(m.user_id) == me, "ts": int(ts * 1000), "type": m.item_type, "text": label, "mediaRef": media_ref}


def inbox(amount):
    me = state["userId"]
    out = []
    with api_lock:
        threads = [(t, False) for t in client.direct_threads(amount=amount, thread_message_limit=10)]
        try:
            threads += [(t, True) for t in client.direct_pending_inbox(amount=10)]
        except Exception:  # les demandes de message sont un bonus
            pass
    for t, is_pending in threads:
        if t.is_group:
            continue  # pour l'instant : conversations à deux uniquement
        out.append(
            {
                "threadId": str(t.id),
                "pending": is_pending or bool(t.pending),
                "users": [short_user(u) for u in t.users],
                "messages": [message_json(m, me) for m in t.messages],
            }
        )
    return out


def send(thread_id, text, pending_thread):
    with api_lock:
        if pending_thread:
            try:
                client.direct_pending_approve(int(thread_id))  # accepte la demande de message
            except Exception:
                pass
        msg = client.direct_send(text, thread_ids=[int(thread_id)])
        return str(msg.id)


def publish(kind, path, caption, link):
    """Publie une photo (publication) ou une story, avec un autocollant lien pour les stories."""
    from PIL import Image
    from instagrapi.types import StoryLink

    src = Path(path)
    jpg = src.with_suffix(".upload.jpg")
    with Image.open(src) as im:
        im.convert("RGB").save(jpg, "JPEG", quality=92)
    try:
        with api_lock:
            if kind == "story":
                links = [StoryLink(webUri=link, x=0.5, y=0.82, width=0.6, height=0.08)] if link else []
                story = client.photo_upload_to_story(jpg, caption="", links=links)
                return {"id": str(story.pk), "code": None}
            media = client.photo_upload(jpg, caption)
            return {"id": str(media.pk), "code": media.code}
    finally:
        try:
            jpg.unlink()
        except FileNotFoundError:
            pass


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # pas de journal bruyant
        pass

    def reply(self, code, body):
        data = json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def authorized(self):
        if not TOKEN or self.headers.get("X-IG-Token") != TOKEN:
            self.reply(401, {"error": "Non autorisé"})
            return False
        return True

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}") if n else {}

    def do_GET(self):
        if not self.authorized():
            return
        if self.path == "/status":
            with state_lock:
                return self.reply(200, dict(state))
        if self.path.startswith("/inbox"):
            if not client:
                return self.reply(409, {"error": "Instagram n'est pas connecté."})
            try:
                return self.reply(200, {"threads": inbox(20)})
            except Exception as err:  # noqa: BLE001
                if isinstance(err, (LoginRequired, ChallengeRequired)):
                    set_state(status="error", error=friendly(err))
                return self.reply(502, {"error": friendly(err)})
        self.reply(404, {"error": "Introuvable"})

    def do_POST(self):
        global client
        if not self.authorized():
            return
        b = self.body()
        if self.path == "/login":
            username = (b.get("username") or "").strip().lstrip("@")
            password = b.get("password") or ""
            if not username or not password:
                return self.reply(400, {"error": "Identifiant et mot de passe requis."})
            if state["status"] in ("logging_in", "two_factor", "challenge"):
                return self.reply(409, {"error": "Une connexion est déjà en cours."})
            set_state(status="logging_in", error=None, username=username)
            threading.Thread(target=do_login, args=(username, password), daemon=True).start()
            return self.reply(200, {"ok": True})
        if self.path == "/login-session":
            sessionid = "".join(str(b.get("sessionid") or "").split()).strip('"')
            if len(sessionid) < 20:
                return self.reply(400, {"error": "Valeur « sessionid » invalide."})
            if state["status"] in ("logging_in", "two_factor", "challenge"):
                return self.reply(409, {"error": "Une connexion est déjà en cours."})
            set_state(status="logging_in", error=None)
            threading.Thread(target=do_login_session, args=(sessionid,), daemon=True).start()
            return self.reply(200, {"ok": True})
        if self.path == "/code":
            code = "".join(ch for ch in str(b.get("code") or "") if ch.isdigit())
            if not pending["kind"] or not code:
                return self.reply(400, {"error": "Aucun code attendu."})
            pending["code"] = code
            set_state(status="logging_in")
            pending["event"].set()
            return self.reply(200, {"ok": True})
        if self.path == "/logout":
            client = None
            for f in (SESSION, ACCOUNT):
                try:
                    f.unlink()
                except FileNotFoundError:
                    pass
            set_state(status="logged_out", username=None, fullName=None, userId=None, followers=None, picture=None, error=None)
            return self.reply(200, {"ok": True})
        if self.path == "/send":
            if not client:
                return self.reply(409, {"error": "Instagram n'est pas connecté."})
            text = (b.get("text") or "").strip()
            if not text or not b.get("threadId"):
                return self.reply(400, {"error": "Message vide."})
            try:
                return self.reply(200, {"id": send(b["threadId"], text[:1000], bool(b.get("pending")))})
            except Exception as err:  # noqa: BLE001
                if isinstance(err, (LoginRequired, ChallengeRequired)):
                    set_state(status="error", error=friendly(err))
                return self.reply(502, {"error": friendly(err)})
        if self.path == "/convert":
            # Conversion d'image (WebP, AVIF…) en JPEG pour les visuels : n'a pas besoin d'Instagram.
            try:
                from PIL import Image

                with Image.open(b["src"]) as im:
                    im.convert("RGB").save(b["dest"], "JPEG", quality=92)
                return self.reply(200, {"ok": True})
            except Exception as err:  # noqa: BLE001
                return self.reply(400, {"error": f"Conversion impossible : {err}"[:200]})
        if self.path == "/publish":
            if not client:
                return self.reply(409, {"error": "Instagram n'est pas connecté."})
            if b.get("kind") not in ("post", "story") or not b.get("path"):
                return self.reply(400, {"error": "Contenu invalide."})
            try:
                return self.reply(200, publish(b["kind"], b["path"], (b.get("caption") or "")[:2200], (b.get("link") or "").strip()))
            except Exception as err:  # noqa: BLE001
                if isinstance(err, (LoginRequired, ChallengeRequired)):
                    set_state(status="error", error=friendly(err))
                return self.reply(502, {"error": friendly(err)})
        if self.path == "/seen":
            if client and b.get("threadId"):
                try:
                    with api_lock:
                        client.direct_send_seen(int(b["threadId"]))
                except Exception:
                    pass
            return self.reply(200, {"ok": True})
        self.reply(404, {"error": "Introuvable"})


if __name__ == "__main__":
    resume()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"[instagram] service prêt sur 127.0.0.1:{PORT}", flush=True)
    server.serve_forever()
