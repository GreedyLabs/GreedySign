import nodemailer from 'nodemailer';
import type {
  SendInviteEmailParams,
  SendCompletionEmailParams,
  SendDeclineEmailParams,
} from '../types.js';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT ?? '587'),
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? '';
const APP_URL = process.env.APP_URL ?? '';
const CONTACT_EMAIL = (FROM.match(/<([^>]+)>/)?.[1] ?? FROM).trim();

// ─── 공통 이메일 래퍼 ─────────────────────────────────────
// SMTP 미설정 시 콘솔 출력만 하고 에러는 던지지 않음.
async function safeSend(mail: nodemailer.SendMailOptions): Promise<void> {
  if (!process.env.SMTP_HOST) {
    console.log(`[email skip] to=${String(mail.to)} subject="${String(mail.subject)}"`);
    return;
  }
  await transporter.sendMail(mail);
}

// ─── 공통 HTML 레이아웃 ────────────────────────────────────
function layout({
  title,
  preheader,
  body,
}: {
  title: string;
  preheader: string;
  body: string;
}): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f2937;">
  <div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:#3b82f6;padding:20px 32px;">
            <span style="font-size:16px;font-weight:700;color:#fff;letter-spacing:-0.3px;">GreedySign</span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;">${title}</h2>
            ${body}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #f3f4f6;">
            <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.6;">
              이 이메일은 GreedySign에서 자동 발송되었습니다.${
                CONTACT_EMAIL
                  ? `<br>\n              문의: <a href="mailto:${CONTACT_EMAIL}" style="color:#6b7280;">${CONTACT_EMAIL}</a>`
                  : ''
              }
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── 서명 초대 이메일 ──────────────────────────────────────
export async function sendInviteEmail({
  toEmail,
  inviterName,
  docName,
  token,
  role = 'signer',
}: SendInviteEmailParams): Promise<void> {
  const inviteUrl = `${APP_URL}/invite/${token}`;
  const isCc = role === 'cc';
  const subjectTag = isCc ? '문서 공유 알림' : '서명 요청';
  const btnLabel = isCc ? '문서 확인하기' : '문서 확인 및 서명하기';

  await safeSend({
    from: FROM,
    to: toEmail,
    subject: `[GreedySign] ${inviterName}님이 "${docName}" 문서 ${isCc ? '를 공유했습니다' : '에 서명을 요청했습니다'}`,
    html: layout({
      title: subjectTag,
      preheader: `${inviterName}님으로부터 "${docName}" 문서가 도착했습니다.`,
      body: `
        <p style="margin:0 0 24px;color:#4b5563;line-height:1.6;">
          <strong>${inviterName}</strong>님이 <strong>"${docName}"</strong> 문서에
          ${isCc ? '참조자로 등록하여 공유했습니다.' : '서명을 요청했습니다.'}
        </p>
        <a href="${inviteUrl}"
           style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;
                  text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
          ${btnLabel}
        </a>
        <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">
          이 링크는 <strong>${toEmail}</strong> 계정만 사용할 수 있습니다.<br>
          본인이 요청하지 않았다면 이 이메일을 무시하세요.
        </p>`,
    }),
  });
}

// ─── 서명 완료 이메일 ──────────────────────────────────────
export async function sendCompletionEmail({
  toEmail,
  recipientName,
  ownerName,
  docName,
  docId,
}: SendCompletionEmailParams): Promise<void> {
  const docUrl = `${APP_URL}/docs/${docId}/complete`;
  // 인증서 페이지는 ?download=1 쿼리를 받으면 도착 즉시 확정본 PDF 다운로드를
  // 자동 트리거한다. 이메일 링크 클릭은 GET + 무 헤더라 API 직링크로는
  // 다운로드 못 받는다(POST + Authorization 필수). 인증서 페이지를 경유해
  // 라우터 가드가 로그인 → 다운로드까지 한 흐름으로 처리하도록 위임.
  const downloadUrl = `${docUrl}?download=1`;

  await safeSend({
    from: FROM,
    to: toEmail,
    subject: `[GreedySign] "${docName}" 문서의 모든 서명이 완료되었습니다`,
    html: layout({
      // 이메일 클라이언트마다 이모지(🎉) 렌더링이 제각각이라 텍스트만 사용한다.
      title: '서명 완료',
      preheader: `"${docName}" 문서에 모든 서명이 수집되어 최종 확정되었습니다.`,
      body: `
        <p style="margin:0 0 16px;color:#4b5563;line-height:1.6;">
          안녕하세요${recipientName ? `, <strong>${recipientName}</strong>` : ''}님.<br>
          <strong>"${docName}"</strong> 문서에 모든 서명이 수집되어 최종 확정되었습니다.
        </p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:24px;">
          <p style="margin:0;font-size:13px;color:#15803d;line-height:1.6;">
            <strong>[확정]</strong> 서명이 완료된 PDF는 SHA-256 해시로 무결성이 보장됩니다.<br>
            문서는 더 이상 수정할 수 없으며, 언제든지 아래 링크에서 열람·다운로드할 수 있습니다.
          </p>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px;">
          <a href="${docUrl}"
             style="display:inline-block;padding:11px 22px;background:#3b82f6;color:#fff;
                    text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
            서명 인증서 보기
          </a>
          <a href="${downloadUrl}"
             style="display:inline-block;padding:11px 22px;background:#f9fafb;color:#374151;
                    text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;
                    border:1px solid #e5e7eb;">
            완성 PDF 다운로드
          </a>
        </div>
        <p style="margin:0;font-size:12px;color:#9ca3af;">
          문서 소유자: <strong>${ownerName}</strong>
        </p>`,
    }),
  });
}

// ─── 서명 거부 알림 이메일 (소유자 수신) ──────────────────
export async function sendDeclineEmail({
  toEmail,
  ownerName,
  signerName,
  signerEmail,
  docName,
  reason = '',
}: SendDeclineEmailParams): Promise<void> {
  await safeSend({
    from: FROM,
    to: toEmail,
    subject: `[GreedySign] "${docName}" 문서의 서명이 거부되었습니다`,
    html: layout({
      title: '서명 거부 알림',
      preheader: `${signerName ?? signerEmail}님이 "${docName}" 서명을 거부했습니다.`,
      body: `
        <p style="margin:0 0 16px;color:#4b5563;line-height:1.6;">
          안녕하세요, <strong>${ownerName}</strong>님.<br>
          아래 서명자가 <strong>"${docName}"</strong> 문서의 서명을 거부했습니다.
        </p>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:24px;">
          <p style="margin:0;font-size:13px;color:#991b1b;line-height:1.8;">
            <strong>서명자</strong>: ${signerName ?? '—'} (${signerEmail})<br>
            ${reason ? `<strong>거부 사유</strong>: ${reason}` : ''}
          </p>
        </div>
        <p style="margin:0;font-size:13px;color:#4b5563;">
          문서를 무효화하거나 참여자를 수정한 후 다시 발송할 수 있습니다.
        </p>`,
    }),
  });
}
