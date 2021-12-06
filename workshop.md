# Workshop hands-on session

## Prerequisite

### Create a free account on YugabyteDB cloud and Apollo Platform


- Create a [Yugabyte Cloud Instance](https://www.yugabyte.com/cloud/)
   - Navigate to `Add IP Allow List` page and add your local workstation ip-address 
  to allow access to the YugabyteDB cloud instance from your workstation
- create an account on [Apollo Studio](studio.apollographql.com) 

# Space Explorer App - Setting up the workshop project

This application has two components, Server app which implements the GraphQL schema and Resolvers 
with YugabyteDB datasource as backend for storing the mutations and The Client App which queries the GraphQL Server
for displaying the Travel options and checkout functionality for the users.

## Import the the `server-initial` and `client` project into your IDE

This repo has three folders:
- `server-initial`: React project we will be incremently building to implement GraphQL APIs using Apollo Server and YugabyteDB Database
- `server`: Complete code for Apollo Server configured to use YugabyteDB database for Storing data using GraphQL Mutationsl
- `client`: Space explorer app built using ReactJS


## Build the Schema for Space Explorer App

The GraqphQL Server App we are building today should be able to handle the following

- Fetch a list of all upcoming Rcoket Launches
- Fetch a Specific Launch by its ID
- Log in the User
- Book a launch for a logged-in user
- cancel a preivously booked launch for a logged-in user

## Implement the GraphQL Types, Quries and Mutations in `src/schema.js`

### Step 1: Import `gql` from apollo-server and create a variable called typeDefs for Space Explorer schema

```js
const { gql } = require('apollo-server');

const typeDefs = gql`
  # Your schema will go here
`;

module.exports = typeDefs;
```

### Step 2: Building the Object Types required for `Launch`, `User` and reservation functionality. Paste the following Types inside `typeDefs` declaration in `src/schema.js`

```js

type Launch {
  id: ID!
  site: String
  mission: Mission
  rocket: Rocket
  isBooked: Boolean!
}

type Rocket {
  id: ID!
  name: String
  type: String
}

type User {
  id: ID!
  email: String!
  trips: [Launch]!
  token: String
}

type Mission {
  name: String
  missionPatch(size: PatchSize): String
}

enum PatchSize {
  SMALL
  LARGE
}

type TripUpdateResponse {
  success: Boolean!
  message: String
  launches: [Launch]
}

type LaunchConnection {
  cursor: String!
  hasMore: Boolean!
  launches: [Launch]!
}
```

### Step 3: Add GraphQL Queries

In the previous step we have implemented the Object types required for our app and in the next step,
we will create the GraphQL queries that will be used by the clients for fetching the information

```js
type Query {
  launches(
    """
    The number of results to show. Must be >= 1. Default = 20
    """
    pageSize: Int
    """
    If you add a cursor here, it will only return results _after_ this cursor
    """
    after: String
  ): LaunchConnection!
  launch(id: ID!): Launch
  me: User
}
```

### Step 4: Add mutation for booking a launch for logged-in user

Queries enable clients to fetch data, but not to modify data. To enable clients to modify data, our schema needs to define following mutations.

```js

  type Mutation {
    # if false, signup failed -- check errors
    bookTrips(launchIds: [ID]!): TripUpdateResponse!

    # if false, cancellation failed -- check errors
    cancelTrip(launchId: ID!): TripUpdateResponse!

    login(email: String): User
  }
```

### Step 5: Start the Apollo server and explore the types using Apollo Studio

```bash
npm install
npm start
```

Apollo Server will by default start on `http://localhost:4000`. Visit [Apollo Studio](https://studio.apollographql.com/sandbox) to explore the schema. 
Apollo Studio automatically attempts to connect to the Apollo Server on Default host:port `http://localhost:4000`.


##  Connect to Datasource

We have defined the GraphQL Types in the previous step, now lets connect our Server app to datasource for fetching information regrading the launches and
storing the user launch booking information. Server app will use the following Datasources - 


- SpaceX REST API Datasource

Server app will use [SpaceX v2 REST API](https://github.com/r-spacex/SpaceX-API) for fetching the launch information and its a readonly information and 
the implemention for fectching launch information is implemented in `src/datasources/launch.js` file. Review the `launch.js` file which contains details 
on the fetching the API information and corresponding GraphQL reducers for serving the Launch Queries.

- Connect to YugabyteDB Datasource

All the User account information and launch booking information is going to be stored in the YugabyteDB Postgres Complaint Database. Implementation for Store and 
updating the database in implemented in `src/datasources/user.js`. This class has the following methods to interact with the database 

- `findOrCreateUser({ email })`: Finds or creates a user with a given email in the database.
- `bookTrips({ launchIds })`: Takes an object with an array of launchIds and books them for the logged-in user.
- `cancelTrip({ launchId })`: Takes an object with a launchId and cancels that launch for the logged-in user.
- `getLaunchIdsByUser()`: Returns all booked trips for the logged-in user.
- `isBookedOnLaunch({ launchId })`: Determines whether the logged-in user has booked a trip on a particular launch.

### Step 1: Setup the YugabyteDB Connectivity using Sequilize


NodeJS applications use Sequilize ORM for interacting with database, which is intern used by the `User.js` Apollo DataSource we created in the previous step.
Navigate to the `src/util.js` file and the following code 

```js
module.exports.createStore = () => {
  const db = new Sequelize({
    host: '6d6eafb9-813c-4f35-9e36-xxxxxx.cloudportal.yugabyte.com',
    port: '5433',
    dialect: 'postgres',
    username: 'admin',
    password: 'xxxxxx',
    database: 'yugabyte',
    dialectOptions: {
      ssl: {
        rejectUnauthorized: false,
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
```

In the above code we are creating a new Sequilze instance `new Sequelize({})` for connecting to YugabyteDB database using the following properties


| Properties    | Description   | Default |
| ------------- | ------------- | ------- |
| `host`  | The yugabyte cloud hostname | `localhost`  |
| `username` | The username to connect to the database. | `postgres` |
| `password` | The password to connect to the database. Leave blank for the password. | - |

Variables `users` and `trips` are defining the Database tables that gets automatically created when the Server App is started.


### Step 2: Create mutation resolvers for `Users` and `Trips` table


Add the following code to `src/datasource/user.js` file

```js
  /**
   * User can be called with an argument that includes email, but it doesn't
   * have to be. If the user is already on the context, it will use that user
   * instead
   */
  async findOrCreateUser({ email: emailArg } = {}) {
    const email =
      this.context && this.context.user ? this.context.user.email : emailArg;
    if (!email || !isEmail.validate(email)) return null;

    const users = await this.store.users.findOrCreate({ where: { email } });
    return users && users[0] ? users[0] : null;
  }

  async bookTrips({ launchIds }) {
    const userId = this.context.user.id;
    if (!userId) return;

    let results = [];

    // for each launch id, try to book the trip and add it to the results array
    // if successful
    for (const launchId of launchIds) {
      const res = await this.bookTrip({ launchId });
      if (res) results.push(res);
    }

    return results;
  }

  async bookTrip({ launchId }) {
    const userId = this.context.user.id;
    const res = await this.store.trips.findOrCreate({
      where: { userId, launchId },
    });
    return res && res.length ? res[0].get() : false;
  }

  async cancelTrip({ launchId }) {
    const userId = this.context.user.id;
    return !!this.store.trips.destroy({ where: { userId, launchId } });
  }

  async getLaunchIdsByUser() {
    const userId = this.context.user.id;
    const found = await this.store.trips.findAll({
      where: { userId },
    });
    return found && found.length
      ? found.map(l => l.dataValues.launchId).filter(l => !!l)
      : [];
  }

  async isBookedOnLaunch({ launchId }) {
    if (!this.context || !this.context.user) return false;
    const userId = this.context.user.id;
    const found = await this.store.trips.findAll({
      where: { userId, launchId },
    });
    return found && found.length > 0;
  }
```

In `src/Index.js` file, Apollo Server uses YugabyteDB Store with the following code 

```js
// creates a sequelize connection once. NOT for every request
const store = createStore();

// set up any dataSources our resolvers need
const dataSources = () => ({
  launchAPI: new LaunchAPI(),
  userAPI: new UserAPI({ store }),
});
```

### Step 2: Start the Apollo server

```bash
npm install
npm start
```

### Step 3: Navigate to Apollo studio and run following GraphQL Queries and Mutations


- Add a new user

```graphql
mutation LoginUser {
  login(email: "nikhil@yugabyte.com") {
    token
  }
}
```

The server will send a response like below

```json
{
  "data": {
    "login": {
      "token": "bmlraGlsQHl1Z2FieXRlLmNvbQ=="
    }
  }
}
```

- Book Trips

```graphql
mutation BookTrips {
  bookTrips(launchIds: [67, 68, 69]) {
    success
    message
    launches {
      id
    }
  }
}
```
and paste the autorization code from the previous graphql query in `HTTP_HEADERS` for `BookTrips` Mutation.

You'll see a response like below 

```
{
  "data": {
    "bookTrips": {
      "success": true,
      "message": "trips booked successfully",
      "launches": [
        {
          "id": "67"
        },
        {
          "id": "68"
        },
        {
          "id": "69"
        }
      ]
    }
  }
}
```


## Run the client App

Navigate to Client folder and start the app

```bash
npm install
npm start
```















