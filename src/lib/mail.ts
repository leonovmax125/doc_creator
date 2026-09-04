import 'server-only';
import nodemailer from 'nodemailer';

// Отправка писем через SMTP (заменяет письма Supabase). Если SMTP не настроен
// (нет SMTP_HOST), письма не отправляются — функция тихо возвращает false, а в
// dev выводит ссылку в консоль, чтобы можно было проверить восстановление без
// почтового сервера. Приложение при этом не падает.

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
  }
  return transporter;
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<boolean> {
  const tx = getTransporter();
  if (!tx) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[mail] SMTP не настроен, письмо для ${opts.to} не отправлено:\n${opts.text ?? opts.html}`);
    }
    return false;
  }
  await tx.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@localhost',
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
  return true;
}
