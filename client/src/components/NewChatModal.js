import React, { useState } from 'react';
import { X, Users, User } from 'lucide-react';
import './NewChatModal.css';

const NewChatModal = ({ isOpen, onClose, onCreateChat }) => {
  const [chatType, setChatType] = useState('direct');
  const [participantUsername, setParticipantUsername] = useState('');
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (chatType === 'direct') {
        if (!participantUsername.trim()) {
          alert('Please enter a username');
          setLoading(false);
          return;
        }
        await onCreateChat('direct', [participantUsername]);
      } else {
        if (!groupName.trim()) {
          alert('Please enter a group name');
          setLoading(false);
          return;
        }
        // Create a group with just the current user
        await onCreateChat('group', [], groupName);
      }
      
      // Reset form and close modal
      setParticipantUsername('');
      setGroupName('');
      onClose();
    } catch (error) {
      console.error('Error creating chat:', error);
      alert(error.message || 'Failed to create chat. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>New Chat</h2>
          <button className="close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="chat-type-selector">
            <button
              type="button"
              className={`type-button ${chatType === 'direct' ? 'active' : ''}`}
              onClick={() => setChatType('direct')}
            >
              <User size={20} />
              Direct Message
            </button>
            <button
              type="button"
              className={`type-button ${chatType === 'group' ? 'active' : ''}`}
              onClick={() => setChatType('group')}
            >
              <Users size={20} />
              Group Chat
            </button>
          </div>

          {chatType === 'direct' ? (
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                value={participantUsername}
                onChange={(e) => setParticipantUsername(e.target.value)}
                placeholder="Enter username to message"
                required
                disabled={loading}
              />
            </div>
          ) : (
            <div className="form-group">
              <label htmlFor="groupName">Group Name</label>
              <input
                type="text"
                id="groupName"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Enter group name"
                required
                disabled={loading}
              />
            </div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="cancel-button"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="create-button"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Chat'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewChatModal;
