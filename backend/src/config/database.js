const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const connection = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const admin = connection.connection.db.admin();
    let helloResponse;

    try {
      helloResponse = await admin.command({ hello: 1 });
    } catch {
      helloResponse = await admin.command({ isMaster: 1 });
    }

    const isReplicaSet = Boolean(helloResponse?.setName);
    const isMongos = helloResponse?.msg === "isdbgrid";
    connection.connection.transactionsSupported = isReplicaSet || isMongos;

    console.log(`✓ MongoDB Connected: ${connection.connection.host}`);
    console.log(
      `✓ Transactions supported: ${connection.connection.transactionsSupported}`,
    );
    return connection;
  } catch (error) {
    console.error(`✗ Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
