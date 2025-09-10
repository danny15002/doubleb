import React from 'react';
import './VersionInfo.css';

const VersionInfo = ({ className = '' }) => {
  // These are injected at build time by Vite
  const buildTimestamp = typeof __BUILD_TIMESTAMP__ !== 'undefined' ? __BUILD_TIMESTAMP__ : 'Development';
  const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

  return (
    <div className={`version-info ${className}`}>
      <span className="version-text">
        Version: {buildTimestamp}
      </span>
    </div>
  );
};

export default VersionInfo;
