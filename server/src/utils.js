const {Sequelize} = require('sequelize');

module.exports.paginateResults = ({
  after: cursor,
  pageSize = 20,
  results,
  // can pass in a function to calculate an item's cursor
  getCursor = () => null,
}) => {
  if (pageSize < 1) return [];

  if (!cursor) return results.slice(0, pageSize);
  const cursorIndex = results.findIndex(item => {
    // if an item has a `cursor` on it, use that, otherwise try to generate one
    let itemCursor = item.cursor ? item.cursor : getCursor(item);

    // if there's still not a cursor, return false by default
    return itemCursor ? cursor === itemCursor : false;
  });

  return cursorIndex >= 0
    ? cursorIndex === results.length - 1 // don't let us overflow
      ? []
      : results.slice(
          cursorIndex + 1,
          Math.min(results.length, cursorIndex + 1 + pageSize),
        )
    : results.slice(0, pageSize);
};

module.exports.createStore = () => {
  const db = new Sequelize({
    host: '6d6eafb9-813c-4f35-9e36-8090981641d4.cloudportal.yugabyte.com',
    port: '5433',
    dialect: 'postgres',
    username: 'admin',
    password: '5WI5BjX7xZuHqaYjI8asRYCgDPXz6X',
    database: 'yugabyte',
    dialectOptions: {
      ssl: {
        rejectUnauthorized: false,
        // ca: fs.readFileSync('/Users/nikhil/.postgresql/root.cer').toString(),
      }
    }
  });

  const users = db.define('user', {
    createdAt: Sequelize.DATE,
    updatedAt: Sequelize.DATE,
    email: Sequelize.STRING,
    profileImage: Sequelize.STRING,
    token: Sequelize.STRING,
  });

  const trips = db.define('trip', {
    createdAt: Sequelize.DATE,
    updatedAt: Sequelize.DATE,
    launchId: Sequelize.INTEGER,
    userId: Sequelize.INTEGER,
  });

  (async () => {
    await db.sync({ force: true });
    // Code here
  })();

  return { db, users, trips };
};
