/**
 * Distributed Lock Manager for handling concurrent booking requests
 * Uses MongoDB collections to implement pessimistic locking
 */

const mongoose = require("mongoose");

const lockSchema = new mongoose.Schema({
  resourceId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  lockedBy: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    // Automatically delete lock after 30 seconds (safety mechanism)
    expires: 30,
  },
});

const Lock = mongoose.model("Lock", lockSchema);

class LockManager {
  /**
   * Attempt to acquire a lock for a specific resource
   * @param {string} resourceId - Unique identifier for the resource (e.g., timeSlotId)
   * @param {string} lockerId - Unique identifier for the lock requester
   * @param {number} maxRetries - Maximum retry attempts
   * @param {number} retryDelayMs - Delay between retries in milliseconds
   * @returns {Promise<boolean>} - True if lock acquired, false otherwise
   */
  static async acquireLock(
    resourceId,
    lockerId,
    maxRetries = 5,
    retryDelayMs = 100,
  ) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Try to create a new lock document
        const lock = await Lock.create({
          resourceId,
          lockedBy: lockerId,
        });

        if (lock) {
          console.log(`✓ Lock acquired for ${resourceId} by ${lockerId}`);
          return true;
        }
      } catch (error) {
        // Duplicate key error means lock already exists
        if (error.code === 11000) {
          console.log(
            `⏳ Lock unavailable for ${resourceId}, attempt ${attempt + 1}/${maxRetries}`,
          );

          // Wait before retry
          if (attempt < maxRetries - 1) {
            await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          }
        } else {
          throw error;
        }
      }
    }

    console.log(
      `✗ Failed to acquire lock for ${resourceId} after ${maxRetries} attempts`,
    );
    return false;
  }

  /**
   * Release a lock for a specific resource
   * @param {string} resourceId - Unique identifier for the resource
   * @param {string} lockerId - Unique identifier of the lock owner
   * @returns {Promise<boolean>} - True if lock was released
   */
  static async releaseLock(resourceId, lockerId) {
    try {
      const result = await Lock.deleteOne({
        resourceId,
        lockedBy: lockerId,
      });

      if (result.deletedCount > 0) {
        console.log(`✓ Lock released for ${resourceId}`);
        return true;
      }

      console.warn(`⚠ Lock not found for ${resourceId}`);
      return false;
    } catch (error) {
      console.error(`Error releasing lock: ${error.message}`);
      throw error;
    }
  }

  /**
   * Force release a lock (admin/cleanup only)
   * @param {string} resourceId - Unique identifier for the resource
   */
  static async forceReleaseLock(resourceId) {
    try {
      const result = await Lock.deleteOne({ resourceId });
      console.log(`Force released lock for ${resourceId}`);
      return result.deletedCount > 0;
    } catch (error) {
      console.error(`Error force releasing lock: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if a resource is currently locked
   * @param {string} resourceId - Unique identifier for the resource
   * @returns {Promise<boolean>} - True if locked
   */
  static async isLocked(resourceId) {
    const lock = await Lock.findOne({ resourceId });
    return !!lock;
  }

  /**
   * Get lock information
   * @param {string} resourceId - Unique identifier for the resource
   * @returns {Promise<object|null>} - Lock document or null
   */
  static async getLockInfo(resourceId) {
    return await Lock.findOne({ resourceId });
  }

  /**
   * Execute a function with automatic lock management
   * @param {string} resourceId - Resource identifier
   * @param {string} lockerId - Lock owner identifier
   * @param {Function} callback - Async function to execute while holding the lock
   * @returns {Promise} - Result of the callback
   */
  static async withLock(resourceId, lockerId, callback) {
    const acquired = await this.acquireLock(resourceId, lockerId);

    if (!acquired) {
      throw new Error(`Could not acquire lock for ${resourceId}`);
    }

    try {
      const result = await callback();
      return result;
    } finally {
      await this.releaseLock(resourceId, lockerId);
    }
  }
}

module.exports = LockManager;
module.exports.Lock = Lock;
