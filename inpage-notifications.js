// In-page notification system for Copilot Sidebar Extension
(function() {
  'use strict';

  // Create and inject notification styles
  function injectNotificationStyles() {
    if (document.getElementById('copilot-sidebar-notification-styles')) return;

    const style = document.createElement('style');
    style.id = 'copilot-sidebar-notification-styles';
    style.textContent = `
      .copilot-sidebar-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        max-width: 300px;
        padding: 12px 16px;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
        font-size: 13px;
        line-height: 1.3;
        color: white;
        transform: translateX(100%);
        transition: transform 0.3s ease-in-out;
        pointer-events: none;
      }

      .copilot-sidebar-notification.show {
        transform: translateX(0);
      }

      .copilot-sidebar-notification.success {
        background-color: #10b981;
      }

      .copilot-sidebar-notification.error {
        background-color: #ef4444;
        border-left: 3px solid #dc2626;
      }

      .copilot-sidebar-notification.info {
        background-color: #3b82f6;
        border-left: 3px solid #2563eb;
      }

      .copilot-sidebar-notification.warning {
        background-color: #f59e0b;
        border-left: 3px solid #d97706;
        color: #1f2937;
      }

      .copilot-sidebar-notification-title {
        font-weight: 600;
        margin-bottom: 2px;
        font-size: 14px;
        display: flex;
        align-items: center;
      }

      .copilot-sidebar-notification-title::before {
        content: "✓";
        margin-right: 6px;
        font-size: 12px;
      }

      .copilot-sidebar-notification.error .copilot-sidebar-notification-title::before,
      .copilot-sidebar-notification.info .copilot-sidebar-notification-title::before,
      .copilot-sidebar-notification.warning .copilot-sidebar-notification-title::before {
        content: none;
      }

      .copilot-sidebar-notification-message {
        opacity: 0.9;
        font-size: 12px;
      }

      .copilot-sidebar-notification-close {
        position: absolute;
        top: 6px;
        right: 6px;
        width: 16px;
        height: 16px;
        background: rgba(255, 255, 255, 0.2);
        border: none;
        border-radius: 50%;
        color: white;
        font-size: 10px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
      }

      .copilot-sidebar-notification-close:hover {
        background: rgba(255, 255, 255, 0.3);
      }

      @media (max-width: 480px) {
        .copilot-sidebar-notification {
          right: 10px;
          left: 10px;
          max-width: none;
          top: 10px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Create and show notification
  function showNotification(type, title, message, duration = 3000) {
    injectNotificationStyles();

    // Remove any existing notifications
    const existing = document.querySelector('.copilot-sidebar-notification');
    if (existing) {
      existing.remove();
    }

    const notification = document.createElement('div');
    notification.className = `copilot-sidebar-notification ${type}`;
    
    notification.innerHTML = `
      <div class="copilot-sidebar-notification-title">${title}</div>
      <div class="copilot-sidebar-notification-message">${message}</div>
      <button class="copilot-sidebar-notification-close" aria-label="Close">×</button>
    `;

    document.body.appendChild(notification);

    // Add close functionality
    const closeBtn = notification.querySelector('.copilot-sidebar-notification-close');
    closeBtn.addEventListener('click', () => {
      hideNotification(notification);
    });

    // Auto-close after duration
    setTimeout(() => {
      hideNotification(notification);
    }, duration);

    // Trigger animation
    requestAnimationFrame(() => {
      notification.classList.add('show');
    });

    return notification;
  }

  // Hide notification
  function hideNotification(notification) {
    if (!notification || !notification.parentNode) return;
    
    notification.classList.remove('show');
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 300);
  }

  // Listen for messages from background script
  function setupMessageListener() {
    if (window.copilotSidebarNotificationsSetup) return;
    window.copilotSidebarNotificationsSetup = true;

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'SHOW_INPAGE_NOTIFICATION') {
        const { notificationType, title, message, duration } = request.data;
        showNotification(notificationType, title, message, duration);
        sendResponse({ success: true });
      }
    });
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupMessageListener);
  } else {
    setupMessageListener();
  }

  // Expose to global scope for manual usage
  window.CopilotSidebarNotifications = {
    show: showNotification,
    hide: hideNotification
  };
})();