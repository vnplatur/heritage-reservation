# Understanding the Heritage Reservation System - Developer Guide

This guide explains how the system works, why decisions were made, and what you need to understand for your assignment.

---

## 1. THE CORE PROBLEM: Preventing Double-Booking

### The Scenario

- Heritage site has 50 tickets available per hour
- 100 users simultaneously try to book during peak time
- **Challenge**: Ensure exactly 50 bookings succeed, not 51 or 0

### Why This Is Hard

```
User A              User B              User C
│                   │                   │
├─ Read Tickets: 1  │                   │
│                   ├─ Read Tickets: 1  │
│                   │                   ├─ Read Tickets: 1
│                   │                   │
├─ Subtract 1       │                   │
│                   ├─ Subtract 1       │
│                   │                   ├─ Subtract 1
│                   │                   │
├─ Write Tickets: 0 │                   │
                    ├─ Write Tickets: 0 (WRONG!)
                                        ├─ Write Tickets: 0 (WRONG!)

All three thought they reserved the last ticket!
```

### Our Solution: Three-Layer Defense

**Layer 1: Application Lock**

```
User A acquires LOCK
│ (User B waits)
├─ Read
├─ Check
├─ Decrement
└─ Release LOCK ✓

User B acquires LOCK
├─ Read (sees updated value)
├─ Check
├─ Decrement
└─ Release LOCK ✓
```

**Layer 2: MongoDB ACID Transaction**

```
Transaction {
  if (availableTickets >= requested) {
    availableTickets -= requested
    createReservation()
    commit() ✓
  } else {
    abort() ✗
  }
}
```

**Layer 3: Optimistic Versioning**

```
Read: availableTickets = 10, __v = 5
...
Update where __v = 5 (only if unchanged)
// If another transaction updated it first, __v changed
// This update fails, preventing stale data writes
```

---

## 2. UNDERSTANDING THE BOOKING CONTROLLER

### File: `backend/src/controllers/bookingController.js`

This is the **most critical file** for your assignment. Let's break it down:

```javascript
exports.createBooking = async (req, res, next) => {
  // Step 1: Create a session (DB transaction container)
  const session = await mongoose.startSession();
  session.startTransaction();

  // Step 2: Create a unique request ID for locking
  const lockerId = uuidv4();

  // Step 3: Validate input
  if (!siteId || !date || !time || !ticketCount) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  // Step 4: Acquire application-level lock
  const lockResourceId = `booking_${siteId}_${date}_${time}`;
  const lockAcquired = await LockManager.acquireLock(lockResourceId, lockerId);
  if (!lockAcquired) {
    return res.status(429).json({ error: 'Slot being booked, try again' });
  }

  // Step 5: Fetch site (with session = in transaction)
  const site = await Site.findById(siteId).session(session);

  // Step 6: Find or create time slot
  let timeSlot = await TimeSlot.findOne({...}).session(session);
  if (!timeSlot) {
    timeSlot = await TimeSlot.create([{...}], { session });
  }

  // Step 7: Check availability (the critical check!)
  if (timeSlot.availableTickets < ticketCount) {
    // Capacity exceeded - abort transaction
    await session.abortTransaction();
    return res.status(400).json({ error: 'Not enough tickets' });
  }

  // Step 8: Decrement available tickets
  const updateResult = await TimeSlot.findByIdAndUpdate(
    timeSlot._id,
    { $inc: { availableTickets: -ticketCount } },
    { session }
  );

  // Step 9: Create reservation record
  const reservation = await Reservation.create([{
    user: userId,
    ticketCount,
    ...
  }], { session });

  // Step 10: Commit (write everything to DB)
  await session.commitTransaction();

  // Step 11: Release the lock
  await LockManager.releaseLock(lockResourceId, lockerId);

  // Step 12: Send response
  res.status(201).json({ success: true, reservation: reservation[0] });
};
```

### Key Points to Understand

1. **Why `session.startTransaction()`?**
   - Groups all database operations
   - If any operation fails, ALL operations rollback
   - Ensures atomicity (all-or-nothing)

2. **Why lock BEFORE transaction?**
   - Lock prevents other requests from even trying
   - Transaction ensures consistency within the lock
   - Double protection

3. **Why check availability AFTER fetching?**
   - Database might have changed between requests
   - Latest data is always used
   - Race conditions eliminated

4. **Why `$inc` instead of assignment?**

   ```javascript
   // WRONG (vulnerable to race conditions):
   timeSlot.availableTickets -= ticketCount;
   await timeSlot.save();

   // CORRECT (atomic):
   await TimeSlot.findByIdAndUpdate(timeSlot._id, {
     $inc: { availableTickets: -ticketCount },
   });
   ```

   - `$inc` is atomic at database level
   - Happens as single operation, no race window

---

## 3. THE LOCK MANAGER EXPLAINED

### File: `backend/src/utils/lockManager.js`

```javascript
static async acquireLock(resourceId, lockerId, maxRetries = 5) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Try to INSERT a lock document
      const lock = await Lock.create({
        resourceId,        // e.g., "booking_site1_2024-06-30_10:00"
        lockedBy: lockerId  // e.g., unique request ID
      });

      // If this succeeds, we have the lock!
      return true;

    } catch (error) {
      if (error.code === 11000) {
        // Duplicate key: someone else has the lock
        // Wait a bit and try again
        await sleep(150);
      }
    }
  }

  // After all retries, give up
  return false;
}

static async releaseLock(resourceId, lockerId) {
  // Simply delete the lock document
  await Lock.deleteOne({ resourceId, lockedBy: lockerId });
}
```

### How It Works

1. **Lock Acquisition Uses MongoDB's Unique Index**

   ```javascript
   // In Lock schema:
   resourceId: { type: String, unique: true }

   // This means only ONE lock can exist per resource
   // If creation fails with duplicate key error = lock taken
   ```

2. **Retry with Exponential Backoff**

   ```
   Attempt 1: Try immediately (fail)
   Wait 150ms
   Attempt 2: Try again (fail)
   Wait 150ms
   Attempt 3: Try again (succeed!)
   ```

3. **TTL (Time-To-Live) Safety**
   ```javascript
   createdAt: {
     type: Date,
     expires: 30  // MongoDB automatically deletes after 30 seconds
   }
   ```

   - Prevents deadlocks if server crashes
   - Lock automatically released after timeout

---

## 4. MONGODB SCHEMA DESIGN

### Why These Fields?

**TimeSlot Collection:**

```javascript
{
  site: ObjectId,              // Link to Site document
  date: Date,                  // ISO date for range queries
  time: String,                // HH:MM format for searching
  totalCapacity: Number,       // Never changes (immutable)
  availableTickets: Number,    // Decrements with bookings ⭐
  __v: Number                  // Version for optimistic locking
}
```

**Why `availableTickets` as a field?**

- Alternative: Count active reservations each time (slower)
- We use a counter: Direct update, no aggregation needed
- Performance: O(1) instead of O(n)

**Why compound unique index?**

```javascript
schema.index({ site: 1, date: 1, time: 1 }, { unique: true });
```

- Ensures no duplicate slots (e.g., "Taj Mahal on 2024-06-30 at 10:00")
- Prevents duplicate time slots during race conditions

**Reservation Collection:**

```javascript
{
  reservationId: String,       // Public ID for user (don't expose MongoDB _id)
  user: ObjectId,              // Link to User ← IDOR prevention!
  site: ObjectId,
  timeSlot: ObjectId,
  ticketCount: Number,
  status: String,              // "confirmed", "cancelled", "pending"
  createdAt: Date              // For sorting and cleanup
}
```

### Indexes for Performance

```javascript
// Speed up: "Get all reservations by user"
reservationSchema.index({ user: 1, createdAt: -1 });

// Speed up: "Get all reservations for a site on a date"
reservationSchema.index({ site: 1, date: 1 });
```

**Why these specific indexes?**

- Most common queries
- Prevent full collection scans
- MongoDB query planner can use them

---

## 5. JWT AUTHENTICATION & IDOR PREVENTION

### The JWT Flow

```
User Login:
├─ POST /api/auth/login { email, password }
├─ Backend: Hash check password ✓
├─ Backend: Generate JWT with { id, role, expiresIn: "7d" }
└─ Return: { token: "eyJhbGc..." }

Frontend stores token in localStorage

User Books:
├─ POST /api/bookings (with Authorization: Bearer eyJhbGc...)
├─ Backend: Verify JWT signature (hasn't been tampered)
├─ Backend: Extract user ID from token
└─ Continue booking as that user
```

### Why JWT?

**Alternative: Sessions**

```
Pro:  Can revoke immediately
Con:  Need to store on server, doesn't scale
```

**JWT Benefits:**

```
✓ Stateless: Server doesn't store session data
✓ Scalable: Works with multiple servers
✓ Secure: Digitally signed, can't be modified
✗ Can't revoke instantly (use blacklist for logout)
```

### Preventing IDOR (Insecure Direct Object Reference)

**VULNERABLE:**

```javascript
exports.getBooking = async (req, res) => {
  const booking = await Reservation.findById(req.params.id);
  return res.json(booking); // Anyone can access any booking!
};
```

**SECURE:**

```javascript
exports.getBooking = async (req, res) => {
  const booking = await Reservation.findOne({
    _id: req.params.id,
    user: req.user.id, // ← Only if it's the logged-in user's booking
  });

  if (!booking) return res.status(404).json({ error: "Not found" });
  return res.json(booking);
};
```

**Key Principle:**

> Always verify the resource belongs to the authenticated user before returning it.

---

## 6. WEBSOCKET REAL-TIME UPDATES

### How Socket.io Works

```
Frontend (React)          Backend (Express + Socket.io)
│                         │
├─ Connect ────────────→ Socket listening
│                         ├─ User joins room
│                         │  (e.g., "site_123")
│                         │
├─ User books ──────────→ Create booking
                          ├─ Booking successful
                          ├─ Emit event to room
└─ Receive update ←────── capacity-update event
   │
   └─ Update UI (no refresh needed!)
```

### Backend Code

```javascript
// In bookingController after successful booking:
req.app.io.to(`site_${siteId}`).emit("capacity-update", {
  slotId: timeSlot._id,
  availableTickets: updateResult.availableTickets,
});
```

### Frontend Code

```javascript
useEffect(() => {
  // Connect to WebSocket
  const socket = io("http://localhost:5000");

  // Join room for current site
  socket.emit("join-site", siteId);

  // Listen for updates
  socket.on("capacity-update", (data) => {
    setCapacityUpdates((prev) => ({
      ...prev,
      [data.slotId]: data.availableTickets,
    }));
  });

  return () => socket.close();
}, [siteId]);
```

---

## 7. PASSWORD HASHING WITH BCRYPTJS

### Why Hash Passwords?

**If stored in plain text:**

```
Database leak → Attacker has all passwords
```

**With hashing:**

```
Database leak → Attacker sees: "$2b$10$xK8.2kZ..."
└─ Can't reverse-engineer password
└─ Can't use password on other sites
```

### How bcryptjs Works

```javascript
// During registration:
const salt = await bcrypt.genSalt(10);
this.password = await bcrypt.hash(password, salt);
// Stores: "$2b$10$salt$hash" (slow to compute intentionally)

// During login:
const isMatch = await bcrypt.compare(loginPassword, storedHash);
// Hashes loginPassword same way and compares
// Result: match or no match (no plain text compared)
```

**Salt Rounds = 10**

- Higher = slower hashing = more secure against brute force
- Takes ~100ms per hash (acceptable)
- An attacker needs ~100ms per guess

---

## 8. ERROR HANDLING MIDDLEWARE

### Global Error Handler

```javascript
const errorHandler = (err, req, res, next) => {
  // Catches all errors thrown in routes/controllers

  if (err.code === 11000) {
    // MongoDB duplicate key error
    return res.status(400).json({ error: "Duplicate field" });
  }

  if (err.name === "ValidationError") {
    // Invalid data
    return res.status(400).json({ error: err.message });
  }

  if (err.name === "JsonWebTokenError") {
    // Tampered token
    return res.status(401).json({ error: "Invalid token" });
  }

  // Generic error
  return res.status(500).json({ error: "Server error" });
};
```

**Why centralized?**

- Consistent error responses
- Don't leak stack traces to client
- Easy to add logging/monitoring

---

## 9. TESTING CONCURRENCY MANUALLY

### Scenario: Book exactly 3 tickets, 10 users try simultaneously

```bash
# 1. Get token
TOKEN=$(curl -X POST http://localhost:5000/api/auth/login \
  -d '{"email":"test@test.com","password":"password"}' \
  | jq -r '.token')

# 2. Get site ID
SITE=$(curl http://localhost:5000/api/sites | jq -r '.[0]._id')

# 3. Run 10 concurrent bookings
for i in {1..10}; do
  curl -X POST http://localhost:5000/api/bookings \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"siteId":"'"$SITE"'","date":"2024-06-30","time":"10:00","ticketCount":1}' &
done

wait  # Wait all to complete

# 4. Check database
mongosh
> db.reservations.countDocuments({ status: 'confirmed' })
# Should be exactly 3, not more, not less!
```

---

## 10. UNDERSTANDING ACID PROPERTIES

### Atomicity

**All-or-nothing execution**

```javascript
// Either both happen or neither:
1. Decrement availableTickets ✓
2. Create reservation        ✓
// If (2) fails, (1) also undoes (abortTransaction)
```

### Consistency

**Data integrity maintained**

```javascript
// Rule: availableTickets >= 0 always
// If booking would make it negative, entire transaction aborts
if (timeSlot.availableTickets < ticketCount) {
  throw new Error("Not enough tickets");
}
```

### Isolation

**No interference between transactions**

```
Transaction A reads availableTickets: 10
Transaction B reads availableTickets: 10
Transaction A books 8 (now 2)
Transaction B attempts to book 10
└─ B sees 2 in isolated snapshot, not 10!
└─ B's transaction fails (not enough)
```

### Durability

**Committed data survives failures**

```javascript
await session.commitTransaction();
// Even if server crashes now, data is safe on disk
```

---

## 11. THINGS TO EXPLAIN IN YOUR INTERVIEW

### If Asked: "How does your system prevent double-booking?"

**Answer Structure:**

1. **Identify the Problem**: Race condition where multiple users read stale data
2. **Explain Layer 1**: Application lock ensures only one request processes at a time
3. **Explain Layer 2**: Transaction ensures all-or-nothing consistency
4. **Explain Layer 3**: Versioning catches if data was modified
5. **Give Example**: Walk through scenario with 2 users booking last ticket

### If Asked: "How do you handle security?"

**Answer:**

- JWT tokens for stateless authentication
- IDOR prevention by verifying user ownership
- Passwords hashed with bcryptjs
- Protected routes with middleware

### If Asked: "Why MongoDB transactions?"

**Answer:**

- Multiple documents affected (TimeSlot + Reservation)
- Need all-or-nothing guarantee
- ACID compliance required for business data

---

## 12. COMMON MISTAKES TO AVOID

❌ **DON'T:** Trust user input

```javascript
// WRONG:
timeSlot.availableTickets -= req.body.ticketCount;

// RIGHT:
await TimeSlot.findByIdAndUpdate({
  $inc: { availableTickets: -ticketCount },
});
```

❌ **DON'T:** Forget transaction if operation fails

```javascript
// WRONG:
try { ... } finally { releaseLock() }

// RIGHT:
try { ... }
catch { session.abortTransaction() }
finally { releaseLock() }
```

❌ **DON'T:** Store sensitive data in JWT

```javascript
// WRONG:
jwt.sign({ id, password, role }, secret);

// RIGHT:
jwt.sign({ id, role }, secret);
```

❌ **DON'T:** Use plain text passwords

```javascript
// WRONG:
user.password = req.body.password;

// RIGHT: (handled automatically in model)
user.password = req.body.password;
// Model pre-save hook hashes it
```

---

## Key Takeaways

1. **Concurrency is Hard**: Requires layers of protection (lock + transaction + versioning)
2. **Security First**: Every response must verify user ownership
3. **Database Design Matters**: Indexes, schemas, and transactions are critical
4. **Real-Time is Reactive**: WebSockets push updates, don't pull
5. **Error Handling is Centralized**: Middleware catches all issues
6. **Code is for Humans**: Comments explain why, not just what

Good luck with your assignment! 🚀
