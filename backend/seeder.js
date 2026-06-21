const dotenv = require("dotenv");
const mongoose = require("mongoose");
const Site = require("./src/models/Site");
const User = require("./src/models/User");

dotenv.config({ path: "./.env" });

const adminAccount = {
  name: "Admin User",
  email: "admin@heritage.com",
  password: "Admin@123",
  role: "admin",
};

const sampleSites = [
  {
    name: "Heritage Citadel Museum",
    description:
      "A restored fortress showcasing local culture, artifacts, and guided tours across the ancient walls.",
    location: "Old Town Boulevard",
    dailyCapacity: 400,
    hourlyCapacity: 50,
    operatingHours: {
      openTime: "09:00",
      closeTime: "18:00",
    },
  },
  {
    name: "Royal Gardens Pavilion",
    description:
      "A historic garden estate with seasonal exhibitions, interactive cultural performances, and landscape tours.",
    location: "Riverside Avenue",
    dailyCapacity: 300,
    hourlyCapacity: 40,
    operatingHours: {
      openTime: "10:00",
      closeTime: "17:00",
    },
  },
  {
    name: "Temple Heritage Walk",
    description:
      "An ancient temple complex with timed entry and immersive storytelling sessions for visitors.",
    location: "Heritage Lane",
    dailyCapacity: 250,
    hourlyCapacity: 30,
    operatingHours: {
      openTime: "08:00",
      closeTime: "16:00",
    },
  },
];

const seedSites = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("Connected to MongoDB for seeding");

    const existingAdmin = await User.findOne({ email: adminAccount.email });
    if (!existingAdmin) {
      await User.create(adminAccount);
      console.log(
        `Admin account created: ${adminAccount.email} / ${adminAccount.password}`,
      );
    } else {
      console.log("Admin account already exists.");
    }

    const existingCount = await Site.countDocuments();
    if (existingCount > 0) {
      console.log(
        `Database already contains ${existingCount} site(s). No site seeding needed.`,
      );
      process.exit(0);
    }

    await Site.insertMany(sampleSites);
    console.log("Sample heritage sites inserted successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding sites:", error);
    process.exit(1);
  }
};

seedSites();
