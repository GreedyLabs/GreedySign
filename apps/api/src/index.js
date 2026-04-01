import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fileUpload from 'express-fileupload';

import authRouter from './routes/auth.js';
import documentsRouter from './routes/documents.js';
import fieldOperationsRouter from './routes/fieldOperations.js';
import signaturesRouter from './routes/signatures.js';
import eventsRouter from './routes/events.js';
import inviteRouter from './routes/invite.js';

const app = express();

app.use(cors({ origin: process.env.APP_URL || '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(fileUpload({ limits: { fileSize: 50 * 1024 * 1024 } }));

// 인증
app.use('/api/auth', authRouter);

// 문서 (하위: shares, signing, export, fields, events)
app.use('/api/documents', documentsRouter);

// 필드 개별 작업 (ID 기반)
app.use('/api/fields', fieldOperationsRouter);

// 서명
app.use('/api/signatures', signaturesRouter);

// SSE 이벤트 (사용자 전역)
app.use('/api/events', eventsRouter);

// 초대
app.use('/api/invite', inviteRouter);
app.get('/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
