"""`EmailSender` adapters: console (development, link in the logs) and SMTP (configured by `SMTP_*`)."""

import asyncio
import smtplib
from email.message import EmailMessage

import structlog

from music_world.accounts.domain.model import hash_token

log = structlog.get_logger(__name__)

SUBJECT = "Your Music World sign-in link"
SMTP_TIMEOUT_SEC = 10.0
RETRY_BACKOFF_SEC = 1.0
_TRANSIENT = (smtplib.SMTPServerDisconnected, smtplib.SMTPConnectError, ConnectionError, TimeoutError)


def _body(link: str, ttl_min: int) -> str:
    return (
        "Hello,\n\n"
        f"Open this link to sign in to Music World (valid {ttl_min} minutes, single use):\n\n{link}\n\n"
        "If you did not ask for it, ignore this e-mail.\n"
    )


class ConsoleEmailSender:
    """Development only: logs the link (never the address, only a hash prefix)."""

    async def send_sign_in_link(self, email: str, link: str) -> None:
        log.warning("auth.sign_in_link", email_hash=hash_token(email)[:12], link=link)


class SmtpEmailSender:
    def __init__(
        self,
        host: str,
        port: int,
        sender: str,
        *,
        username: str | None = None,
        password: str | None = None,
        starttls: bool = True,
        ttl_min: int = 15,
        smtp_class: type[smtplib.SMTP] = smtplib.SMTP,
    ) -> None:
        self._host, self._port, self._from = host, port, sender
        self._username, self._password, self._starttls, self._ttl = username, password, starttls, ttl_min
        self._smtp_class = smtp_class

    def _send(self, message: EmailMessage) -> None:
        with self._smtp_class(self._host, self._port, timeout=SMTP_TIMEOUT_SEC) as smtp:
            if self._starttls:
                smtp.starttls()
            if self._username and self._password:
                smtp.login(self._username, self._password)
            smtp.send_message(message)

    async def send_sign_in_link(self, email: str, link: str) -> None:
        message = EmailMessage()
        message["Subject"], message["From"], message["To"] = SUBJECT, self._from, email
        message.set_content(_body(link, self._ttl))
        for attempt in range(2):  # one retry on connection problems only (not on refusals or bad credentials)
            try:
                await asyncio.to_thread(self._send, message)
                break
            except _TRANSIENT:
                if attempt == 1:
                    raise
                await asyncio.sleep(RETRY_BACKOFF_SEC)
        log.info("auth.sign_in_link_sent", email_hash=hash_token(email)[:12])
