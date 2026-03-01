import { notifyError } from '../../../../components/toast/toast.js';
import discussionsTemplate from '../../../discussions/discussions.html?raw';
import { renderDiscussionsPageContent } from '../../../discussions/discussions.js';

export const renderAdminDiscussionsSection = async (content) => {
  content.innerHTML = discussionsTemplate;

  try {
    await renderDiscussionsPageContent(content);
  } catch (error) {
    notifyError(error?.message || 'Failed to load discussions section.');
  }
};
