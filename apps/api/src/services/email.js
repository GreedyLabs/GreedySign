import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = process.env.SMTP_FROM || process.env.SMTP_USER;
const APP_URL = process.env.APP_URL;

export async function sendInviteEmail({ toEmail, inviterName, docName, token }) {
  const inviteUrl = `${APP_URL}/invite/${token}`;

  await transporter.sendMail({
    from: FROM,
    to: toEmail,
    subject: `[GreedySign] ${inviterName}님이 "${docName}" 문서에 서명을 요청했습니다`,
    html: `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 16px; color: #1f2937;">
  <h2 style="font-size: 20px; margin-bottom: 8px;">서명 요청</h2>
  <p style="color: #6b7280; margin-bottom: 24px;">
    <strong>${inviterName}</strong>님이 <strong>"${docName}"</strong> 문서에 서명을 요청했습니다.
  </p>
  <a href="${inviteUrl}"
     style="display: inline-block; padding: 12px 24px; background: #3b82f6; color: #fff;
            text-decoration: none; border-radius: 8px; font-weight: 500; font-size: 15px;">
    문서 확인 및 서명하기
  </a>
  <p style="margin-top: 24px; font-size: 12px; color: #9ca3af;">
    이 링크는 본인(${toEmail})만 사용할 수 있습니다.<br>
    요청한 적이 없다면 이 이메일을 무시하세요.
  </p>
</body>
</html>`,
  });
}
