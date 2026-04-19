import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fileUpload from 'express-fileupload';

import authRouter from './routes/auth.js';
import documentsRouter from './routes/documents.js';
import signaturesRouter from './routes/signatures.js';
import eventsRouter from './routes/events.js';
import inviteRouter from './routes/invite.js';
import activityRouter from './routes/activity.js';
import notificationsRouter from './routes/notifications.js';
import searchRouter from './routes/search.js';

const app = express();

app.use(cors({ origin: process.env.APP_URL || '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(fileUpload({ limits: { fileSize: 50 * 1024 * 1024 } }));

// 인증
app.use('/api/auth', authRouter);

// 문서 (하위: participants, signing, export, fields, certificate)
app.use('/api/documents', documentsRouter);

// 서명 라이브러리
app.use('/api/signatures', signaturesRouter);

// SSE 이벤트 (사용자 전역)
app.use('/api/events', eventsRouter);

// 이메일 초대 링크 처리
app.use('/api/invite', inviteRouter);

// 활동 로그
app.use('/api/activity', activityRouter);

// 알림
app.use('/api/notifications', notificationsRouter);

// 통합 검색
app.use('/api/search', searchRouter);

app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
