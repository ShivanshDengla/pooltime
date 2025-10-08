import React from 'react';

const VaultSkeleton: React.FC = () => {
  return (
    <div className="vault-view-bubble">
      {/* Header skeleton */}
      <div style={{ marginBottom: '20px' }}>
        <div className="skeleton-item" style={{ width: '60%', height: '24px', marginBottom: '8px' }}></div>
        <div className="skeleton-item" style={{ width: '40%', height: '16px' }}></div>
      </div>

      {/* Status message skeleton */}
      <div style={{ marginBottom: '20px' }}>
        <div className="skeleton-item" style={{ width: '80%', height: '20px' }}></div>
      </div>

      {/* Balance section skeleton */}
      <div style={{ marginBottom: '20px' }}>
        <div className="skeleton-item" style={{ width: '30%', height: '18px', marginBottom: '8px' }}></div>
        <div className="skeleton-item" style={{ width: '50%', height: '24px' }}></div>
      </div>

      {/* Input section skeleton */}
      <div style={{ marginBottom: '20px' }}>
        <div className="skeleton-item" style={{ width: '100%', height: '40px', borderRadius: '8px' }}></div>
      </div>

      {/* Button skeleton */}
      <div style={{ marginBottom: '20px' }}>
        <div className="skeleton-item" style={{ width: '100%', height: '48px', borderRadius: '8px' }}></div>
      </div>

      {/* Data rows skeleton */}
      <div style={{ marginBottom: '20px' }}>
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
            <div className="skeleton-item" style={{ width: '40%', height: '16px' }}></div>
            <div className="skeleton-item" style={{ width: '30%', height: '16px' }}></div>
          </div>
        ))}
      </div>

      {/* Next draw section skeleton */}
      <div style={{ marginBottom: '20px' }}>
        <div className="skeleton-item" style={{ width: '25%', height: '18px', marginBottom: '8px' }}></div>
        <div className="skeleton-item" style={{ width: '60%', height: '20px' }}></div>
      </div>

      {/* Rewards section skeleton */}
      <div style={{ marginBottom: '20px' }}>
        <div className="skeleton-item" style={{ width: '35%', height: '18px', marginBottom: '8px' }}></div>
        <div className="skeleton-item" style={{ width: '70%', height: '16px' }}></div>
      </div>

      {/* Promotions section skeleton */}
      <div style={{ marginBottom: '20px' }}>
        <div className="skeleton-item" style={{ width: '30%', height: '18px', marginBottom: '8px' }}></div>
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} style={{ marginBottom: '8px', display: 'flex', alignItems: 'center' }}>
            <div className="skeleton-item" style={{ width: '20px', height: '20px', borderRadius: '50%', marginRight: '8px' }}></div>
            <div className="skeleton-item" style={{ width: '50%', height: '16px' }}></div>
          </div>
        ))}
      </div>

      {/* Chance info section skeleton */}
      <div style={{ marginBottom: '20px' }}>
        <div className="skeleton-item" style={{ width: '25%', height: '18px', marginBottom: '8px' }}></div>
        <div className="skeleton-item" style={{ width: '80%', height: '60px', borderRadius: '8px' }}></div>
      </div>
    </div>
  );
};

export default VaultSkeleton;
