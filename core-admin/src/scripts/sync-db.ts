import sequelize from '../lib/database.js';
import Domain from '../models/Domain.js';
import Record from '../models/Record.js';

async function syncDatabase() {
  try {
    console.log('🔄 Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Database connection established.');

    console.log('🔄 Synchronizing models...');
    // Set to false in production - only for development
    await sequelize.sync({ alter: true });
    console.log('✅ Database models synchronized.');

    console.log('🔄 Testing database operations...');
    
    // Test domain creation
    const testDomain = await Domain.findOne({ where: { name: 'test.local' } });
    if (!testDomain) {
      await Domain.create({
        name: 'test.local',
        type: 'NATIVE'
      });
      console.log('✅ Test domain created.');
    }

    console.log('🎉 Database setup completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  }
}

syncDatabase();