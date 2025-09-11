const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const pushNotificationService = require('../services/pushNotificationService');

const router = express.Router();

// Subscribe to push notifications
router.post('/subscribe', authenticateToken, [
  body('subscription').isObject().withMessage('Subscription object is required'),
  body('subscription.endpoint').isURL().withMessage('Valid endpoint URL is required'),
  body('subscription.keys').isObject().withMessage('Subscription keys are required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const { subscription } = req.body;
    const userId = req.user.id;

    const success = await pushNotificationService.storeSubscription(userId, subscription);
    
    if (success) {
      res.json({ 
        message: 'Push subscription stored successfully',
        success: true 
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to store push subscription' 
      });
    }
  } catch (error) {
    console.error('Push subscription error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Unsubscribe from push notifications
router.delete('/unsubscribe', authenticateToken, [
  body('endpoint').isURL().withMessage('Valid endpoint URL is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const { endpoint } = req.body;
    const userId = req.user.id;

    const success = await pushNotificationService.removeSubscription(userId, endpoint);
    
    if (success) {
      res.json({ 
        message: 'Push subscription removed successfully',
        success: true 
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to remove push subscription' 
      });
    }
  } catch (error) {
    console.error('Push unsubscription error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's push subscriptions
router.get('/subscriptions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const subscriptions = await pushNotificationService.getUserSubscriptions(userId);
    
    res.json({ 
      subscriptions,
      count: subscriptions.length 
    });
  } catch (error) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test push notification (for debugging)
router.post('/test', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { title = 'Test Notification', body = 'This is a test push notification' } = req.body;

    const payload = {
      title,
      body,
      icon: '/manifest.json',
      badge: '/manifest.json',
      data: {
        url: '/',
        type: 'test'
      },
      requireInteraction: true,
      silent: false,
      tag: 'test-notification'
    };

    const result = await pushNotificationService.sendToUser(userId, payload);
    
    res.json({ 
      message: 'Test notification sent',
      result 
    });
  } catch (error) {
    console.error('Test notification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get VAPID public key
router.get('/vapid-key', (req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  
  if (!publicKey) {
    return res.status(500).json({ 
      error: 'VAPID public key not configured' 
    });
  }
  
  res.json({ 
    publicKey,
    success: true 
  });
});

module.exports = router;
