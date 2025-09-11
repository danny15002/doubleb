const webpush = require('web-push');
const { pool } = require('../database/connection');

// Configure VAPID details
webpush.setVapidDetails(
  process.env.VAPID_EMAIL || 'mailto:your-email@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

class PushNotificationService {
  constructor() {
    this.isConfigured = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
    
    if (!this.isConfigured) {
      console.warn('VAPID keys not configured. Push notifications will not work.');
    }
  }

  // Store a push subscription for a user
  async storeSubscription(userId, subscription) {
    try {
      const subscriptionData = JSON.stringify(subscription);
      
      // Check if subscription already exists
      const existing = await pool.query(
        'SELECT id FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
        [userId, subscription.endpoint]
      );

      if (existing.rows.length > 0) {
        // Update existing subscription
        await pool.query(
          'UPDATE push_subscriptions SET subscription_data = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 AND endpoint = $3',
          [subscriptionData, userId, subscription.endpoint]
        );
        console.log('Push subscription updated for user:', userId);
      } else {
        // Insert new subscription
        await pool.query(
          'INSERT INTO push_subscriptions (user_id, endpoint, subscription_data) VALUES ($1, $2, $3)',
          [userId, subscription.endpoint, subscriptionData]
        );
        console.log('Push subscription stored for user:', userId);
      }
      
      return true;
    } catch (error) {
      console.error('Error storing push subscription:', error);
      return false;
    }
  }

  // Remove a push subscription
  async removeSubscription(userId, endpoint) {
    try {
      await pool.query(
        'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
        [userId, endpoint]
      );
      console.log('Push subscription removed for user:', userId);
      return true;
    } catch (error) {
      console.error('Error removing push subscription:', error);
      return false;
    }
  }

  // Get all subscriptions for a user
  async getUserSubscriptions(userId) {
    try {
      const result = await pool.query(
        'SELECT subscription_data FROM push_subscriptions WHERE user_id = $1',
        [userId]
      );
      
      return result.rows.map(row => JSON.parse(row.subscription_data));
    } catch (error) {
      console.error('Error getting user subscriptions:', error);
      return [];
    }
  }

  // Send push notification to a specific user
  async sendToUser(userId, payload) {
    if (!this.isConfigured) {
      console.warn('Push notifications not configured');
      return { success: false, error: 'Push notifications not configured' };
    }

    try {
      const subscriptions = await this.getUserSubscriptions(userId);
      
      if (subscriptions.length === 0) {
        console.log('No push subscriptions found for user:', userId);
        return { success: false, error: 'No subscriptions found' };
      }

      const results = [];
      
      for (const subscription of subscriptions) {
        try {
          const result = await webpush.sendNotification(subscription, JSON.stringify(payload));
          results.push({ success: true, subscription: subscription.endpoint });
          console.log('Push notification sent successfully to:', subscription.endpoint);
        } catch (error) {
          console.error('Error sending push notification:', error);
          
          // If subscription is invalid, remove it
          if (error.statusCode === 410 || error.statusCode === 404) {
            await this.removeSubscription(userId, subscription.endpoint);
            console.log('Removed invalid subscription:', subscription.endpoint);
          }
          
          results.push({ 
            success: false, 
            error: error.message, 
            subscription: subscription.endpoint 
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      return { 
        success: successCount > 0, 
        sent: successCount, 
        total: subscriptions.length,
        results 
      };
    } catch (error) {
      console.error('Error sending push notification to user:', error);
      return { success: false, error: error.message };
    }
  }

  // Send push notification to multiple users
  async sendToUsers(userIds, payload) {
    const results = [];
    
    for (const userId of userIds) {
      const result = await this.sendToUser(userId, payload);
      results.push({ userId, ...result });
    }
    
    return results;
  }

  // Send message notification
  async sendMessageNotification(message, chatInfo, excludeUserId = null) {
    const payload = {
      title: `${message.sender_name || message.username} in ${chatInfo.display_name || chatInfo.name}`,
      body: this.stripHtml(message.content),
      icon: '/manifest.json',
      badge: '/manifest.json',
      data: {
        url: `/chat/${message.chat_id}`,
        chatId: message.chat_id,
        messageId: message.id,
        type: 'message'
      },
      actions: [
        {
          action: 'open',
          title: 'Open Chat',
          icon: '/manifest.json'
        },
        {
          action: 'close',
          title: 'Close',
          icon: '/manifest.json'
        }
      ],
      requireInteraction: true,
      silent: false,
      tag: `chat-${message.chat_id}`
    };

    // Get all chat participants except the sender
    try {
      const participants = await pool.query(`
        SELECT DISTINCT user_id 
        FROM chat_participants 
        WHERE chat_id = $1 AND user_id != $2
      `, [message.chat_id, excludeUserId || message.user_id]);

      const userIds = participants.rows.map(row => row.user_id);
      
      if (userIds.length > 0) {
        return await this.sendToUsers(userIds, payload);
      }
      
      return { success: false, error: 'No recipients found' };
    } catch (error) {
      console.error('Error sending message notification:', error);
      return { success: false, error: error.message };
    }
  }

  // Send new chat notification
  async sendNewChatNotification(chatInfo, participantId) {
    const payload = {
      title: 'New Chat',
      body: `You've been added to ${chatInfo.name}`,
      icon: '/manifest.json',
      badge: '/manifest.json',
      data: {
        url: `/chat/${chatInfo.id}`,
        chatId: chatInfo.id,
        type: 'new_chat'
      },
      actions: [
        {
          action: 'open',
          title: 'Open Chat',
          icon: '/manifest.json'
        }
      ],
      requireInteraction: false,
      silent: false,
      tag: `new-chat-${chatInfo.id}`
    };

    return await this.sendToUser(participantId, payload);
  }

  // Utility function to strip HTML
  stripHtml(html) {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').trim();
  }
}

module.exports = new PushNotificationService();
