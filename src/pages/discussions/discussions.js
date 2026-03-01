import './discussions.css';
import template from './discussions.html?raw';
import discussionCardTemplate from './discussion-card.html?raw';
import commentItemTemplate from './comment-item.html?raw';
import { isAuthenticated, getCurrentSession, isAdmin, isImpersonating } from '../../features/auth/auth.js';
import { navigateTo } from '../../router/router.js';
import { supabase } from '../../lib/supabase.js';
import { fillTemplate } from '../../lib/template.js';
import { notifyError, notifyInfo, waitForToastVisibility } from '../../components/toast/toast.js';

const DISCUSSION_ATTACHMENT_BUCKET = 'discussion-comment-attachments';
const LEGACY_DISCUSSION_ATTACHMENT_BUCKET = 'signal-comment-attachments';
const expandedDiscussionState = new Map();

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

const escapeAttribute = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const isImageFile = (fileName) => {
  const lower = String(fileName ?? '').toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg'].some((ext) => lower.endsWith(ext));
};

const getDisplayName = (profilesById, userId) => {
  const profile = profilesById.get(userId);
  return profile?.full_name || profile?.email || 'Unknown user';
};

const fetchDiscussionsBundle = async () => {
  const [
    { data: discussions, error: discussionsError },
    { data: comments, error: commentsError },
    { data: profiles, error: profilesError },
    { data: attachments, error: attachmentsError },
    { data: discussionAttachments, error: discussionAttachmentsError }
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

  if (discussionsError) throw discussionsError;
  if (commentsError) throw commentsError;
  if (profilesError) throw profilesError;
  if (attachmentsError) throw attachmentsError;
  if (discussionAttachmentsError) throw discussionAttachmentsError;

  return {
    discussions: discussions ?? [],
    comments: comments ?? [],
    profiles: profiles ?? [],
    attachments: attachments ?? [],
    discussionAttachments: discussionAttachments ?? []
  };
};

const withSignedAttachmentUrls = async (attachments) => {
  if (!attachments.length) {
    return [];
  }

  const resolved = await Promise.all(
    attachments.map(async (attachment) => {
      const { data: primaryData, error: primaryError } = await supabase
        .storage
        .from(DISCUSSION_ATTACHMENT_BUCKET)
        .createSignedUrl(attachment.storage_path, 3600);

      if (!primaryError && primaryData?.signedUrl) {
        return {
          ...attachment,
          downloadUrl: primaryData.signedUrl
        };
      }

      const { data: legacyData, error: legacyError } = await supabase
        .storage
        .from(LEGACY_DISCUSSION_ATTACHMENT_BUCKET)
        .createSignedUrl(attachment.storage_path, 3600);

      if (legacyError || !legacyData?.signedUrl) {
        return {
          ...attachment,
          downloadUrl: ''
        };
      }

      return {
        ...attachment,
        downloadUrl: legacyData.signedUrl
      };
    })
  );

  return resolved;
};

const canUseImagePreviewUrl = async (url) => {
  if (!url) {
    return false;
  }

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      cache: 'no-store'
    });

    return response.ok;
  } catch {
    return false;
  }
};

const buildAttachmentLinksHtml = (attachments) => {
  if (!attachments.length) {
    return '';
  }

  return `<div class="discussion-attachments">${attachments.map((attachment) => {
    if (!attachment.downloadUrl) {
      return `<span class="discussion-attachment-link">${escapeHtml(attachment.file_name)}</span>`;
    }

    return `<a class="discussion-attachment-link" href="${escapeAttribute(attachment.downloadUrl)}" target="_blank" rel="noopener noreferrer">`
      + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
      + `${escapeHtml(attachment.file_name)}</a>`;
  }).join('')}</div>`;
};

const buildCommentHtml = (comment, profilesById, messageAttachments = []) => fillTemplate(commentItemTemplate, {
  author: escapeHtml(getDisplayName(profilesById, comment.owner_user_id)),
  createdAt: formatDate(comment.created_at),
  content: escapeHtml(comment.content_html),
  attachmentsHtml: buildAttachmentLinksHtml(messageAttachments)
});

const renderDiscussions = async (container, bundle) => {
  const profilesById = new Map(bundle.profiles.map((profile) => [profile.user_id, profile]));
  const commentsByDiscussionId = new Map();

  bundle.comments.forEach((comment) => {
    if (!commentsByDiscussionId.has(comment.discussion_id)) {
      commentsByDiscussionId.set(comment.discussion_id, []);
    }
    commentsByDiscussionId.get(comment.discussion_id).push(comment);
  });

  const attachmentsWithUrls = await withSignedAttachmentUrls(bundle.attachments);
  const attachmentsByMessageId = new Map();
  const discussionAttachmentsWithUrls = await withSignedAttachmentUrls(bundle.discussionAttachments);
  const discussionAttachmentsByDiscussionId = new Map();

  attachmentsWithUrls.forEach((attachment) => {
    if (!attachmentsByMessageId.has(attachment.message_id)) {
      attachmentsByMessageId.set(attachment.message_id, []);
    }
    attachmentsByMessageId.get(attachment.message_id).push(attachment);
  });

  discussionAttachmentsWithUrls.forEach((attachment) => {
    if (!discussionAttachmentsByDiscussionId.has(attachment.discussion_id)) {
      discussionAttachmentsByDiscussionId.set(attachment.discussion_id, []);
    }
    discussionAttachmentsByDiscussionId.get(attachment.discussion_id).push(attachment);
  });

  if (!bundle.discussions.length) {
    container.innerHTML = '<div class="card border-0"><div class="card-body discussion-empty">No discussions yet. Start the first discussion.</div></div>';
    return;
  }

  const cards = [];

  for (const [index, discussion] of bundle.discussions.entries()) {
    const comments = commentsByDiscussionId.get(discussion.id) ?? [];
    const discussionAttachments = discussionAttachmentsByDiscussionId.get(discussion.id) ?? [];
    const isExpanded = expandedDiscussionState.has(discussion.id) ? expandedDiscussionState.get(discussion.id) : index === 0;
    expandedDiscussionState.set(discussion.id, isExpanded);
    const previewAttachmentCandidate = discussionAttachments.find((attachment) =>
      attachment.downloadUrl && isImageFile(attachment.file_name)
    );

    let previewAttachment = null;
    if (previewAttachmentCandidate?.downloadUrl) {
      const canUsePreview = await canUseImagePreviewUrl(previewAttachmentCandidate.downloadUrl);
      if (canUsePreview) {
        previewAttachment = previewAttachmentCandidate;
      }
    }

    const discussionPreviewHtml = previewAttachment
      ? `<div class="discussion-preview-wrap mb-3"><img class="discussion-preview-image" src="${escapeAttribute(previewAttachment.downloadUrl)}" alt="Discussion preview" loading="lazy" /></div>`
      : '';

    const discussionAttachmentsHtml = buildAttachmentLinksHtml(discussionAttachments);

    const commentsHtml = comments.length
      ? comments.map((comment) => buildCommentHtml(comment, profilesById, attachmentsByMessageId.get(comment.id) ?? [])).join('')
      : '<p class="text-secondary small mb-0">No comments yet.</p>';

    cards.push(fillTemplate(discussionCardTemplate, {
      discussionId: discussion.id,
      title: escapeHtml(discussion.title),
      author: escapeHtml(getDisplayName(profilesById, discussion.created_by)),
      createdAt: formatDate(discussion.created_at),
      discussionPreviewHtml,
      description: escapeHtml(discussion.description_html),
      discussionAttachmentsHtml: discussionAttachmentsHtml ? `<div class="mb-3">${discussionAttachmentsHtml}</div>` : '',
      commentsHtml,
      collapsedClass: isExpanded ? '' : 'is-collapsed',
      hiddenAttr: isExpanded ? '' : 'hidden',
      toggleLabel: isExpanded ? 'Collapse' : 'Expand',
      expandedAria: isExpanded ? 'true' : 'false'
    }));
  }

  container.innerHTML = cards.join('');
};

const uploadAttachmentsForMessage = async (discussionId, messageId, files, userId) => {
  if (!files.length) {
    return [];
  }

  const rows = [];

  for (const file of files) {
    const safeName = sanitizeFileName(file.name);
    const storagePath = `${discussionId}/${messageId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;

    const { error: uploadError } = await supabase
      .storage
      .from(DISCUSSION_ATTACHMENT_BUCKET)
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

  const { data: insertedRows, error: attachmentsError } = await supabase
    .from('message_attachments')
    .insert(rows)
    .select('id,message_id,file_name,storage_path,created_at');

  if (attachmentsError) {
    throw attachmentsError;
  }

  return insertedRows ?? [];
};

const uploadAttachmentsForDiscussion = async (discussionId, files, userId) => {
  if (!files.length) {
    return [];
  }

  const rows = [];

  for (const file of files) {
    const safeName = sanitizeFileName(file.name);
    const storagePath = `discussion/${discussionId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;

    const { error: uploadError } = await supabase
      .storage
      .from(DISCUSSION_ATTACHMENT_BUCKET)
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

  const { data: insertedRows, error: attachmentsError } = await supabase
    .from('discussion_attachments')
    .insert(rows)
    .select('id,discussion_id,file_name,storage_path,created_at');

  if (attachmentsError) {
    throw attachmentsError;
  }

  return insertedRows ?? [];
};

const appendCommentToDiscussion = (container, discussionId, commentHtml) => {
  const commentList = container.querySelector(`[data-comment-list="${discussionId}"]`);
  if (!commentList) {
    return;
  }

  const placeholder = commentList.querySelector('p.text-secondary.small.mb-0');
  if (placeholder) {
    placeholder.remove();
  }

  commentList.insertAdjacentHTML('beforeend', commentHtml);
};

const attachDiscussionToggleHandlers = (container) => {
  container.querySelectorAll('[data-discussion-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const discussionId = button.getAttribute('data-discussion-toggle');
      const content = container.querySelector(`[data-discussion-content="${discussionId}"]`);
      if (!discussionId || !content) {
        return;
      }

      const willExpand = content.hasAttribute('hidden');
      expandedDiscussionState.set(discussionId, willExpand);

      if (willExpand) {
        content.removeAttribute('hidden');
        content.classList.remove('is-collapsed');
      } else {
        content.setAttribute('hidden', '');
        content.classList.add('is-collapsed');
      }

      button.textContent = willExpand ? 'Collapse' : 'Expand';
      button.setAttribute('aria-expanded', willExpand ? 'true' : 'false');
    });
  });
};

const attachCommentHandlers = (container, bundle) => {
  const profilesById = new Map(bundle.profiles.map((profile) => [profile.user_id, profile]));
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
      if (!submitButton) {
        notifyError('Unable to submit comment right now. Please refresh the page.');
        return;
      }

      if (submitButton.disabled) {
        return;
      }

      submitButton.disabled = true;

      try {
        const { data: insertedMessage, error: insertError } = await supabase
          .from('messages')
          .insert({
            discussion_id: discussionId,
            owner_user_id: userId,
            content_html: content
          })
          .select('id,discussion_id,owner_user_id,content_html,created_at')
          .single();

        if (insertError || !insertedMessage?.id || !insertedMessage?.created_at) {
          notifyError(insertError?.message || 'Failed to send comment.');
          return;
        }

        const insertedAttachments = await uploadAttachmentsForMessage(discussionId, insertedMessage.id, files, userId);
        const attachmentsWithUrls = await withSignedAttachmentUrls(insertedAttachments);
        const commentHtml = buildCommentHtml(insertedMessage, profilesById, attachmentsWithUrls);
        appendCommentToDiscussion(container, discussionId, commentHtml);

        form.reset();
        notifyInfo('Comment sent.');
      } catch (error) {
        notifyError(error?.message || 'Failed to send comment.');
      } finally {
        submitButton.disabled = false;
      }
    });
  });
};

const attachCreateDiscussionHandler = (container, refresh) => {
  const form = container.querySelector('#create-discussion-form');
  const submitButton = container.querySelector('#create-discussion-submit');

  if (!form || !submitButton) {
    return;
  }

  let inFlight = false;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (inFlight) {
      return;
    }

    const userId = getCurrentSession()?.user?.id;
    if (!userId) {
      notifyError('Please sign in to create a discussion.');
      navigateTo('/login');
      return;
    }

    const formData = new FormData(form);
    const title = String(formData.get('title') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();
    const files = Array.from(form.querySelector('input[name="attachments"]')?.files ?? []);

    if (!title || !description) {
      notifyError('Please fill in title and message.');
      return;
    }

    inFlight = true;
    submitButton.disabled = true;

    try {
      const { data: insertedDiscussion, error } = await supabase
        .from('discussions')
        .insert({
          title,
          description_html: description,
          created_by: userId
        })
        .select('id')
        .single();

      if (error || !insertedDiscussion?.id) {
        notifyError(error?.message || 'Failed to create discussion.');
        return;
      }

      try {
        await uploadAttachmentsForDiscussion(insertedDiscussion.id, files, userId);
      } catch (attachmentError) {
        notifyError(attachmentError?.message || 'Discussion created, but attachments failed to upload.');
      }

      notifyInfo('Discussion published.');
      await waitForToastVisibility();
      form.reset();
      await refresh();
    } catch (error) {
      notifyError(error?.message || 'Failed to create discussion.');
    } finally {
      submitButton.disabled = false;
      inFlight = false;
    }
  });
};

export const renderDiscussionsPageContent = async (container, options = {}) => {
  const { readOnly = false } = options;
  expandedDiscussionState.clear();

  const listNode = container.querySelector('#discussions-list');

  if (!listNode) {
    return;
  }

  const refresh = async () => {
    try {
      const bundle = await fetchDiscussionsBundle();
      await renderDiscussions(listNode, bundle);
      attachDiscussionToggleHandlers(container);

      if (readOnly) {
        container.querySelectorAll('[data-comment-form]').forEach((form) => {
          const readOnlyNote = document.createElement('p');
          readOnlyNote.className = 'text-secondary small mb-0 mt-3';
          readOnlyNote.textContent = 'Commenting is disabled while viewing as user.';
          form.replaceWith(readOnlyNote);
        });
      } else {
        attachCommentHandlers(container, bundle);
      }
    } catch (error) {
      notifyError(error.message || 'Failed to load discussions.');
      listNode.innerHTML = '<div class="card border-0"><div class="card-body text-secondary">Unable to load discussions right now.</div></div>';
    }
  };

  if (readOnly) {
    const createForm = container.querySelector('#create-discussion-form');
    const createSectionCard = createForm?.closest('.card');
    if (createSectionCard) {
      createSectionCard.classList.add('d-none');
    }
  } else {
    attachCreateDiscussionHandler(container, refresh);
  }

  await refresh();
};

export const renderDiscussionsPage = async (container) => {
  if (!isAuthenticated()) {
    navigateTo('/login');
    return;
  }

  container.innerHTML = template;
  await renderDiscussionsPageContent(container, { readOnly: isAdmin() && isImpersonating() });
};
