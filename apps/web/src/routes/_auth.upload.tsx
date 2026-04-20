import { createFileRoute } from '@tanstack/react-router';
import UploadPage from '../pages/UploadPage';

export const Route = createFileRoute('/_auth/upload')({
  component: UploadPage,
});
