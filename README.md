# Heritage Reservation System - Assignment

A full-stack tourism and heritage site reservation platform with **absolute transaction safety under high concurrency**, **JWT-secured APIs**, and a **real-time monitoring dashboard**.

## 🎯 Core Features

✅ **System Integrity (40%)**
- Application-level locking mechanism (pessimistic locking)
- MongoDB ACID transactions for multi-document consistency
- Optimistic versioning as secondary safety mechanism
- Prevents double-booking under concurrent load

✅ **Security (30%)**
- JWT authentication with role-based access control
- IDOR prevention (users can only access their own bookings)
- Secure password hashing with bcryptjs
- Protected API endpoints with token verification

✅ **Code Quality & Architecture (20%)**
- Clean separation of concerns (routes → controllers → models)
- Proper TypeScript-ready structure with validation
- Comprehensive error handling middleware
- Database connection management and transaction handling

✅ **UX/UI & Real-Time Functionality (10%)**
- Real-time capacity updates via WebSocket (Socket.io)
- Responsive React dashboard
- Instant feedback on booking status
- Intuitive booking interface

---

## 🏗️ Project Architecture

```
heritage-reservation/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.js         # MongoDB connection
│   │   ├── controllers/
│   │   │   ├── authController.js   # User authentication
│   │   │   ├── bookingController.js # Core booking logic with locking
│   │   │   └── siteController.js   # Heritage site management
│   │   ├── models/
│   │   │   ├── User.js             # User schema with password hashing
│   │   │   ├── Site.js             # Heritage site schema
│   │   │   ├── TimeSlot.js         # Time slot with versioning
│   │   │   └── Reservation.js      # Booking/reservation schema
│   │   ├── middleware/
│   │   │   ├── auth.js             # JWT protection & authorization
│   │   │   └── errorHandler.js     # Global error handling
│   │   ├── routes/
│   │   │   ├── authRoutes.js
│   │   │   ├── siteRoutes.js
│   │   │   └── bookingRoutes.js
│   │   ├── utils/
│   │   │   └── lockManager.js      # ⭐ Application-level locking
│   │   └── server.js               # Express + Socket.io setup
│   ├── package.json
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── Dashboard.jsx       # Admin dashboard
│   │   │   └── *.css
│   │   ├── components/
│   │   │   ├── BookingForm.jsx     # User booking interface
│   │   │   └── *.css
│   │   ├── hooks/
│   │   ├── App.jsx
│   │   ├── index.js
│   │   └── index.css
│   ├── public/
│   │   └── index.html
│   ├── package.json
│   └── .gitignore
│
└── README.md (this file)
```

---

## 🔐 Security Architecture

### JWT Authentication
- Token generated on login/register
- Stored in localStorage (frontend)
- Sent via `Authorization: Bearer <token>` header
- Verified on every protected route

### IDOR Prevention
```javascript
// Example: User can only access their own bookings
const reservation = await Reservation.findOne({
  _id: reservationId,
  user: userId  // ← Ensures ownership
});
```

### JWT Tampering & Privilege Escalation Prevention
- JWTs are signed with `process.env.JWT_SECRET`
- Tokens are verified using explicit `HS256` algorithm
- Payload is validated to contain only `{ id, role }`
- Only `user` or `admin` roles are accepted
- Admin routes and socket admin rooms are protected by role checks

### Standalone MongoDB Transaction Fallback
- If MongoDB is running as a standalone server, ACID transactions are unavailable
- The booking flow falls back to the lock-first pattern with a compensating rollback on failure
- This still preserves TOCTOU safety for same-slot booking attempts

### Password Security
- Hashed with bcryptjs (10 salt rounds)
- Never stored in plain text
- Compared securely on login

---

## ⚙️ Concurrency Control Mechanism

### The Challenge
Multiple users booking the same time slot simultaneously must not result in overbooking.

### Our Solution (3-Layer Defense)

#### 1️⃣ Application-Level Lock (Pessimistic Locking)
```javascript
// Lock acquired before any database operation
const lockResourceId = `booking_${siteId}_${date}_${time}`;
const lockAcquired = await LockManager.acquireLock(lockResourceId, lockerId, 5, 150);
```
- Creates a MongoDB document to prevent concurrent access
- Retries 5 times with 150ms delays
- Auto-releases after 30 seconds (safety mechanism)

#### 2️⃣ MongoDB ACID Transactions
```javascript
const session = await mongoose.startSession();
session.startTransaction();

try {
  // All database operations within transaction
  await TimeSlot.findByIdAndUpdate(..., { session });
  await Reservation.create([...], { session });
  
  await session.commitTransaction();
} catch (error) {
  await session.abortTransaction();
}
```
- Multi-document consistency
- Atomicity: all-or-nothing operations
- Isolation: no dirty reads between transactions
- Durability: persistent after commit

#### 3️⃣ Optimistic Versioning (Fallback)
```javascript
// MongoDB's `__v` field automatically increments on updates
// Prevents concurrent modifications of the same document
```

---

## 📊 Database Schema Design

### TimeSlot Collection
```javascript
{
  _id: ObjectId,
  site: ObjectId,          // Reference to Site
  date: Date,              // YYYY-MM-DD
  time: String,            // HH:MM format
  totalCapacity: Number,   // e.g., 50 tickets/hour
  availableTickets: Number, // Decrements with bookings
  __v: Number             // Version for optimistic locking
}
```

### Indexes for Performance
```javascript
// Unique compound index prevents duplicate slots
timeSlotSchema.index({ site: 1, date: 1, time: 1 }, { unique: true });

// Speeds up reservation queries
reservationSchema.index({ user: 1, createdAt: -1 });
reservationSchema.index({ site: 1, date: 1 });
```

---

## 🚀 Setup & Installation

### Prerequisites
- Node.js 16+
- MongoDB 4.0+ (with ACID transaction support)
- npm or yarn

### Backend Setup

1. **Install dependencies**
   ```bash
   cd backend
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your MongoDB URI and JWT secret
   ```

3. **Example .env**
   ```
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/heritage-reservation
   JWT_SECRET=your_super_secret_key_here
   JWT_EXPIRE=7d
   NODE_ENV=development
   ```

4. **Start MongoDB**
   ```bash
   # macOS/Linux with Homebrew
   brew services start mongodb-community
   
   # Windows (if installed as service)
   net start MongoDB
   
   # Or use Docker
   docker run -d -p 27017:27017 --name mongo mongo:5.0
   ```

5. **Start the backend**
   ```bash
   npm run dev
   ```
   Server runs at: `http://localhost:5000`

### Frontend Setup

1. **Install dependencies**
   ```bash
   cd frontend
   npm install
   ```

2. **Start the frontend**
   ```bash
   npm start
   ```
   App runs at: `http://localhost:3000`

---

## 📝 How to Use

### 1. Register
- Navigate to `/register`
- Create account with name, email, password
- Automatically logged in

### 2. Browse Sites
- Dashboard shows all available heritage sites
- See daily and hourly capacity limits

### 3. Make a Booking
- Click "Book Tickets" on a site
- Select date and time
- Choose number of tickets (1-10)
- Enter visitor details
- Confirm booking

### 4. View Bookings
- "My Bookings" section shows all reservations
- Cancel bookings if needed

### 5. Admin Features
- Create/edit heritage sites (requires admin role)
- Set capacity limits per site

---

## 🧪 Testing for Concurrency

### Simulating High Load

Create `load-test.js` in backend:

```javascript
const axios = require('axios');

async function stressTest() {
  const siteId = 'YOUR_SITE_ID';
  const date = '2024-06-30';
  const time = '10:00';
  
  // Simulate 50 concurrent booking attempts for same slot
  const requests = Array(50).fill().map(() =>
    axios.post('http://localhost:5000/api/bookings', {
      siteId,
      date,
      time,
      ticketCount: 1
    }, {
      headers: { Authorization: `Bearer ${token}` }
    }).catch(e => ({ error: e.response?.status }))
  );

  const results = await Promise.all(requests);
  const successful = results.filter(r => !r.error).length;
  const failed = results.filter(r => r.error).length;

  console.log(`✓ Successful: ${successful}`);
  console.log(`✗ Failed: ${failed}`);
}

stressTest();
```

**Expected Behavior:**
- Only capacity number of bookings succeed
- Rest get 429 "Slot being booked" error
- Zero double-bookings
- Database integrity maintained

---

## 🔍 Understanding the Key Code

### LockManager (src/utils/lockManager.js)
**Purpose:** Prevents race conditions during booking

**Key Method:**
```javascript
static async withLock(resourceId, lockerId, callback) {
  const acquired = await this.acquireLock(resourceId, lockerId);
  if (!acquired) throw new Error('Lock timeout');
  
  try {
    return await callback();
  } finally {
    await this.releaseLock(resourceId, lockerId);
  }
}
```

### Booking Controller (src/controllers/bookingController.js)
**Purpose:** Handles the core booking flow with safety guarantees

**Key Steps:**
1. Acquire application-level lock
2. Start MongoDB transaction
3. Fetch time slot
4. Check availability
5. Update available tickets
6. Create reservation record
7. Commit transaction
8. Release lock

---

## 📡 Real-Time Updates with WebSocket

### How It Works
1. Frontend connects to Socket.io on page load
2. Joins a room for each site (`site_${siteId}`)
3. Backend emits capacity updates after successful bookings
4. Frontend receives and updates UI instantly (no page refresh)

### Example Event Flow
```javascript
// Backend
io.to(`site_${siteId}`).emit('capacity-update', {
  slotId: timeSlot._id,
  availableTickets: updatedCount
});

// Frontend
socket.on('capacity-update', (data) => {
  setCapacityUpdates(prev => ({
    ...prev,
    [data.slotId]: data.availableTickets
  }));
});
```

---

## 🐛 Debugging Tips

### Check Locks
```javascript
// In browser console
const lock = await db.locks.findOne({ resourceId: 'booking_xxx' });
```

### Monitor Transactions
```bash
# MongoDB shell
db.currentOp(true)  # See active operations
```

### API Testing
Use Postman or curl:
```bash
# Register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"John","email":"john@test.com","password":"123456"}'

# Get Available Slots
curl http://localhost:5000/api/bookings/available-slots \
  -G --data-urlencode "siteId=SITE_ID" \
  --data-urlencode "date=2024-06-30"

# Create Booking
curl -X POST http://localhost:5000/api/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"siteId":"xxx","date":"2024-06-30","time":"10:00","ticketCount":2}'
```

---

## 📚 Key Learning Points

1. **ACID Transactions**: Understand atomicity, consistency, isolation, durability
2. **Distributed Locking**: Why we need pessimistic locking for race conditions
3. **JWT Auth**: Stateless authentication vs session-based
4. **WebSocket**: Real-time bidirectional communication
5. **REST API Design**: Proper HTTP methods, status codes, error handling
6. **React State Management**: Handling loading states, real-time updates

---

## ✅ Evaluation Checklist

- [ ] Backend prevents double-booking under concurrent load
- [ ] MongoDB transactions are ACID compliant
- [ ] JWT tokens properly protect endpoints
- [ ] No IDOR vulnerabilities (users only see own data)
- [ ] Code is clean, modular, and well-documented
- [ ] React dashboard updates in real-time via WebSocket
- [ ] Error messages are helpful
- [ ] Performance is acceptable under load

---

## 📞 Common Issues

**MongoDB Connection Error**
```
Error: connect ECONNREFUSED 127.0.0.1:27017
```
→ Make sure MongoDB is running

**CORS Error in Frontend**
```
Access to XMLHttpRequest blocked by CORS policy
```
→ Backend CORS is already configured, ensure port 3000 in whitelist

**WebSocket Connection Failed**
```
WebSocket handshake failed
```
→ Backend Socket.io must be running, check port 5000

---

## 📖 Further Reading

- MongoDB Transactions: https://docs.mongodb.com/manual/transactions/
- JWT Best Practices: https://tools.ietf.org/html/rfc7519
- React Real-time Updates: https://socket.io/docs/v4/socket-io-protocol/
- Concurrency Patterns: https://en.wikipedia.org/wiki/Concurrency_control

---

## 🎓 Assignment Submission Notes

**What to Submit:**
1. `backend/` folder with all source code
2. `frontend/` folder with all source code
3. Updated `.env` (with dummy values)
4. This README
5. A concurrency test report showing zero double-bookings

**What Evaluators Will Check:**
- Codebase for AI generation artifacts
- Functional correctness under concurrent load
- Security vulnerabilities
- Code maintainability and architecture
- Your ability to explain the code

---

Good luck! 🚀
