import './create-signal.css';
import template from './create-signal.html?raw';
import { isAuthenticated, getCurrentSession, isAdmin, isImpersonating } from '../../features/auth/auth.js';
import { navigateTo } from '../../router/router.js';
import { supabase } from '../../lib/supabase.js';
import { notifyError, notifyInfo, waitForToastVisibility } from '../../components/toast/toast.js';

const ATTACHMENT_BUCKET = 'signal-comment-attachments';

const sanitizeFileName = (name) =>
  String(name ?? 'file')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);

const uploadSignalAttachments = async (discussionId, files, userId) => {
  if (!files.length) {
    return;
  }

  const rows = [];

  for (const file of files) {
    const safeName = sanitizeFileName(file.name);
    const storagePath = `signal/${discussionId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;

    const { error: uploadError } = await supabase
      .storage
      .from(ATTACHMENT_BUCKET)
      .upload(storagePath, file, {
        upsert: false,
        cacheControl: '3600'
      });

    if (uploadError) {
      throw uploadError;
    }

    rows.push({
      discussion_id: discussionId,
      file_name: file.name,
      storage_path: storagePath,
      uploaded_by: userId
    });
  }

  const { error: attachmentsError } = await supabase
    .from('discussion_attachments')
    .insert(rows);

  if (attachmentsError) {
    throw attachmentsError;
  }
};

export const renderCreateSignalPage = (container) => {
  if (!isAuthenticated()) {
    navigateTo('/login');
    return;
  }

  if (isAdmin() && isImpersonating()) {
    navigateTo('/dashboard');
    return;
  }

  container.innerHTML = template;

  const form = container.querySelector('#create-signal-form');
  const submitButton = container.querySelector('#create-signal-submit');
  let inFlight = false;

  if (!form || !submitButton) {
    notifyError('Create Signal form failed to initialize. Please refresh the page.');
    return;
  }

  const handlePublish = async () => {

    if (inFlight) {
      return;
    }

    const userId = getCurrentSession()?.user?.id;
    if (!userId) {
      notifyError('Please sign in to create a signal.');
      navigateTo('/login');
      return;
    }

    const formData = new FormData(form);
    const title = String(formData.get('title') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();
    const files = Array.from(container.querySelector('#create-signal-files')?.files ?? []);

    if (!title || !description) {
      notifyError('Please fill in title and message.');
      return;
    }

    inFlight = true;
    submitButton.disabled = true;

    try {
      const { data: insertedSignal, error } = await supabase
        .from('discussions')
        .insert({
          title,
          description_html: description,
          created_by: userId
        })
        .select('id')
        .single();

      if (error || !insertedSignal?.id) {
        notifyError(error.message || 'Failed to create signal.');
        return;
      }

      try {
        await uploadSignalAttachments(insertedSignal.id, files, userId);
      } catch (attachmentError) {
        notifyError(attachmentError?.message || 'Signal created, but attachments failed to upload.');
        await waitForToastVisibility();
        navigateTo('/discussions');
        return;
      }

      notifyInfo('Signal published.');
      await waitForToastVisibility();
      navigateTo('/discussions');
    } catch (error) {
      notifyError(error?.message || 'Failed to create signal.');
    } finally {
      submitButton.disabled = false;
      inFlight = false;
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await handlePublish();
  });

  submitButton.addEventListener('click', async (event) => {
    event.preventDefault();
    await handlePublish();
  });
};
