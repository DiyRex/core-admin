import { Sequelize } from 'sequelize';
import pg from 'pg';

const sequelize = new Sequelize(
  process.env.DATABASE_URL || 'postgresql://coredns:password@localhost:5432/coredns',
  {
    dialect: 'postgres',
    dialectModule: pg,
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  }
);

export default sequelize;