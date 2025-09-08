// Socket.IO manager to avoid circular dependencies
let ioInstance = null;

const setIO = (io) => {
  ioInstance = io;
};

const getIO = () => {
  if (!ioInstance) {
    throw new Error('Socket.IO instance not initialized');
  }
  return ioInstance;
};

module.exports = {
  setIO,
  getIO
};
