import './discussions.css';
import template from './discussions.html?raw';
import signalCardTemplate from './signal-card.html?raw';
import commentItemTemplate from './comment-item.html?raw';
import { isAuthenticated, getCurrentSession, isAdmin, isImpersonating } from '../../features/auth/auth.js';
import { navigateTo } from '../../router/router.js';
import { supabase } from '../../lib/supabase.js';
import { fillTemplate } from '../../lib/template.js';
import { notifyError, notifyInfo } from '../../components/toast/toast.js';

const ATTACHMENT_BUCKET = 'signal-comment-attachments';

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const formatDate = (value) => new Date(value).toLocaleString('bg-BG');

const sanitizeFileName = (name) =>
  String(name ?? 'file')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);

const isImageFile = (fileName) => {
  const lower = String(fileName ?? '').toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg'].some((ext) => lower.endsWith(ext));
};

const getDisplayName = (profilesById, userId) => {
  const profile = profilesById.get(userId);
  return profile?.full_name || profile?.email || 'Unknown user';
};

const fetchSignalsBundle = async () => {
  const [
    { data: signals, error: signalsError },
    { data: comments, error: commentsError },
    { data: profiles, error: profilesError },
    { data: attachments, error: attachmentsError },
    { data: signalAttachments, error: signalAttachmentsError }
  ] = await Promise.all([
    supabase
      .from('discussions')
      .select('id,title,description_html,created_by,created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('messages')
      .select('id,discussion_id,owner_user_id,content_html,created_at')
      .order('created_at', { ascending: true }),
    supabase
      .from('profiles')
      .select('user_id,full_name,email'),
    supabase
      .from('message_attachments')
      .select('id,message_id,file_name,storage_path,created_at')
      .order('created_at', { ascending: true }),
    supabase
      .from('discussion_attachments')
      .select('id,discussion_id,file_name,storage_path,created_at')
      .order('created_at', { ascending: true })
  ]);

  if (signalsError) throw signalsError;
  if (commentsError) throw commentsError;
  if (profilesError) throw profilesError;
  if (attachmentsError) throw attachmentsError;
  if (signalAttachmentsError) throw signalAttachmentsError;

  return {
    signals: signals ?? [],
    comments: comments ?? [],
    profiles: profiles ?? [],
    attachments: attachments ?? [],
    signalAttachments: signalAttachments ?? []
  };
};

const withSignedAttachmentUrls = async (attachments) => {
  if (!attachments.length) {
    return [];
  }

  const resolved = await Promise.all(
    attachments.map(async (attachment) => {
      const { data, error } = await supabase
        .storage
        .from(ATTACHMENT_BUCKET)
        .createSignedUrl(attachment.storage_path, 3600);

      if (error || !data?.signedUrl) {
        return {
          ...attachment,
          downloadUrl: ''
        };
      }

      return {
        ...attachment,
        downloadUrl: data.signedUrl
      };
    })
  );

  return resolved;
};

const renderSignals = async (container, bundle) => {
  const profilesById = new Map(bundle.profiles.map((profile) => [profile.user_id, profile]));
  const commentsBySignalId = new Map();

  bundle.comments.forEach((comment) => {
    if (!commentsBySignalId.has(comment.discussion_id)) {
      commentsBySignalId.set(comment.discussion_id, []);
    }
    commentsBySignalId.get(comment.discussion_id).push(comment);
  });

  const attachmentsWithUrls = await withSignedAttachmentUrls(bundle.attachments);
  const attachmentsByMessageId = new Map();
  const signalAttachmentsWithUrls = await withSignedAttachmentUrls(bundle.signalAttachments);
  const signalAttachmentsBySignalId = new Map();

  attachmentsWithUrls.forEach((attachment) => {
    if (!attachmentsByMessageId.has(attachment.message_id)) {
      attachmentsByMessageId.set(attachment.message_id, []);
    }
    attachmentsByMessageId.get(attachment.message_id).push(attachment);
  });

  signalAttachmentsWithUrls.forEach((attachment) => {
    if (!signalAttachmentsBySignalId.has(attachment.discussion_id)) {
      signalAttachmentsBySignalId.set(attachment.discussion_id, []);
    }
    signalAttachmentsBySignalId.get(attachment.discussion_id).push(attachment);
  });

  if (!bundle.signals.length) {
    container.innerHTML = '<div class="card border-0"><div class="card-body signal-empty">No signals yet. Be the first to post one.</div></div>';
    return;
  }

  const cards = bundle.signals.map((signal) => {
    const comments = commentsBySignalId.get(signal.id) ?? [];
    const signalAttachments = signalAttachmentsBySignalId.get(signal.id) ?? [];
    const previewAttachment = signalAttachments.find((attachment) =>
      attachment.downloadUrl && isImageFile(attachment.file_name)
    );

    const signalPreviewHtml = previewAttachment
      ? `<div class="signal-preview-wrap mb-3"><img class="signal-preview-image" src="${escapeHtml(previewAttachment.downloadUrl)}" alt="Signal preview" loading="lazy" /></div>`
      : '';

    const signalAttachmentsHtml = signalAttachments.length
      ? `<div class="signal-attachments mb-3">${signalAttachments.map((attachment) => {
          if (!attachment.downloadUrl) {
            return `<span class="signal-attachment-link">${escapeHtml(attachment.file_name)}</span>`;
          }

          return `<a class="signal-attachment-link" href="${escapeHtml(attachment.downloadUrl)}" target="_blank" rel="noopener noreferrer">`
            + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
            + `${escapeHtml(attachment.file_name)}</a>`;
        }).join('')}</div>`
      : '';

    const commentsHtml = comments.length
      ? comments.map((comment) => {
          const messageAttachments = attachmentsByMessageId.get(comment.id) ?? [];
          const attachmentsHtml = messageAttachments.length
            ? `<div class="signal-attachments">${messageAttachments.map((attachment) => {
                if (!attachment.downloadUrl) {
                  return `<span class="signal-attachment-link">${escapeHtml(attachment.file_name)}</span>`;
                }

                return `<a class="signal-attachment-link" href="${escapeHtml(attachment.downloadUrl)}" target="_blank" rel="noopener noreferrer">`
                  + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
                  + `${escapeHtml(attachment.file_name)}</a>`;
              }).join('')}</div>`
            : '';

          return fillTemplate(commentItemTemplate, {
            author: escapeHtml(getDisplayName(profilesById, comment.owner_user_id)),
            createdAt: formatDate(comment.created_at),
            content: escapeHtml(comment.content_html),
            attachmentsHtml
          });
        }).join('')
      : '<p class="text-secondary small mb-0">No comments yet.</p>';

    return fillTemplate(signalCardTemplate, {
      signalId: signal.id,
      title: escapeHtml(signal.title),
      author: escapeHtml(getDisplayName(profilesById, signal.created_by)),
      createdAt: formatDate(signal.created_at),
      signalPreviewHtml,
      description: escapeHtml(signal.description_html),
      signalAttachmentsHtml,
      commentsHtml
    });
  }).join('');

  container.innerHTML = cards;
};

const uploadAttachmentsForMessage = async (discussionId, messageId, files, userId) => {
  if (!files.length) {
    return;
  }

  const rows = [];

  for (const file of files) {
    const safeName = sanitizeFileName(file.name);
    const storagePath = `${discussionId}/${messageId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;

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
      message_id: messageId,
      file_name: file.name,
      storage_path: storagePath,
      uploaded_by: userId
    });
  }

  const { error: attachmentsError } = await supabase
    .from('message_attachments')
    .insert(rows);

  if (attachmentsError) {
    throw attachmentsError;
  }
};

const attachCommentHandlers = (container, refresh) => {
  const forms = container.querySelectorAll('[data-comment-form]');

  forms.forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const discussionId = form.getAttribute('data-comment-form');
      const sessionUser = getCurrentSession()?.user;
      const userId = sessionUser?.id;

      if (!discussionId || !userId) {
        notifyError('Please sign in to comment.');
        navigateTo('/login');
        return;
      }

      const formData = new FormData(form);
      const content = String(formData.get('content') ?? '').trim();
      const files = Array.from(form.querySelector('input[name="attachments"]')?.files ?? []);

      if (!content) {
        notifyError('Comment cannot be empty.');
        return;
      }

      const submitButton = form.querySelector('button[type="submit"]');
      submitButton.disabled = true;

      const { data: insertedMessage, error: insertError } = await supabase
        .from('messages')
        .insert({
          discussion_id: discussionId,
          owner_user_id: userId,
          content_html: content
        })
        .select('id')
        .single();

      if (insertError || !insertedMessage?.id) {
        submitButton.disabled = false;
        notifyError(insertError?.message || 'Failed to send comment.');
        return;
      }

      try {
        await uploadAttachmentsForMessage(discussionId, insertedMessage.id, files, userId);
      } catch (error) {
        submitButton.disabled = false;
        notifyError(error.message || 'Comment sent, but attachments failed.');
        await refresh();
        return;
      }

      submitButton.disabled = false;
      notifyInfo('Comment sent.');
      await refresh();
    });
  });
};

export const renderDiscussionsPage = async (container) => {
  if (!isAuthenticated()) {
    navigateTo('/login');
    return;
  }

  if (isAdmin() && isImpersonating()) {
    navigateTo('/dashboard');
    return;
  }

  container.innerHTML = template;
  const signalsList = container.querySelector('#signals-list');

  const refresh = async () => {
    try {
      const bundle = await fetchSignalsBundle();
      await renderSignals(signalsList, bundle);
      attachCommentHandlers(container, refresh);
    } catch (error) {
      notifyError(error.message || 'Failed to load signals.');
      signalsList.innerHTML = '<div class="card border-0"><div class="card-body text-secondary">Unable to load signals right now.</div></div>';
    }
  };

  await refresh();
};
