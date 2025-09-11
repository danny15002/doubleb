import React, { useState } from 'react';
import { useSocket } from '../contexts/SocketContext';
import notificationManager from '../utils/notifications';
import './PushNotificationTest.css';

const PushNotificationTest = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const { testNotification } = useSocket();

  const testLocalNotification = async () => {
    setIsLoading(true);
    setTestResult(null);
    
    try {
      await testNotification();
      setTestResult({ type: 'success', message: 'Local notification test sent!' });
    } catch (error) {
      setTestResult({ type: 'error', message: `Local notification failed: ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const testPushNotification = async () => {
    setIsLoading(true);
    setTestResult(null);
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/push-notifications/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: 'Test Push Notification',
          body: 'This is a test push notification from the server!'
        })
      });

      const result = await response.json();
      
      if (response.ok) {
        setTestResult({ 
          type: 'success', 
          message: `Push notification sent! Result: ${JSON.stringify(result.result)}` 
        });
      } else {
        setTestResult({ type: 'error', message: `Push notification failed: ${result.error}` });
      }
    } catch (error) {
      setTestResult({ type: 'error', message: `Push notification failed: ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const checkSubscription = async () => {
    setIsLoading(true);
    setTestResult(null);
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/push-notifications/subscriptions', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const result = await response.json();
      
      if (response.ok) {
        setTestResult({ 
          type: 'info', 
          message: `You have ${result.count} push subscription(s). Check console for details.`,
          details: result
        });
        console.log('Push subscriptions:', result);
      } else {
        setTestResult({ type: 'error', message: `Failed to check subscriptions: ${result.error}` });
      }
    } catch (error) {
      setTestResult({ type: 'error', message: `Failed to check subscriptions: ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const subscribeToPush = async () => {
    setIsLoading(true);
    setTestResult(null);
    
    try {
      const subscription = await notificationManager.subscribeToPush();
      if (subscription) {
        setTestResult({ type: 'success', message: 'Successfully subscribed to push notifications!' });
      } else {
        setTestResult({ type: 'error', message: 'Failed to subscribe to push notifications' });
      }
    } catch (error) {
      setTestResult({ type: 'error', message: `Subscription failed: ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="push-notification-test">
      <h3>Push Notification Test</h3>
      <p>Test your push notification setup for iOS PWA debugging.</p>
      
      <div className="test-buttons">
        <button 
          onClick={testLocalNotification}
          disabled={isLoading}
          className="btn btn-primary"
        >
          Test Local Notification
        </button>
        
        <button 
          onClick={testPushNotification}
          disabled={isLoading}
          className="btn btn-secondary"
        >
          Test Push Notification
        </button>
        
        <button 
          onClick={checkSubscription}
          disabled={isLoading}
          className="btn btn-info"
        >
          Check Subscription
        </button>
        
        <button 
          onClick={subscribeToPush}
          disabled={isLoading}
          className="btn btn-success"
        >
          Subscribe to Push
        </button>
      </div>

      {testResult && (
        <div className={`test-result ${testResult.type}`}>
          <strong>{testResult.type.toUpperCase()}:</strong> {testResult.message}
          {testResult.details && (
            <pre>{JSON.stringify(testResult.details, null, 2)}</pre>
          )}
        </div>
      )}

      <div className="test-info">
        <h4>How to test on iOS:</h4>
        <ol>
          <li>Add the app to your home screen (PWA)</li>
          <li>Grant notification permission</li>
          <li>Close the app completely</li>
          <li>Send a message from another device/browser</li>
          <li>You should receive a push notification!</li>
        </ol>
      </div>
    </div>
  );
};

export default PushNotificationTest;
