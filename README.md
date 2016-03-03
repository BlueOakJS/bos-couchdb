# bos-couchdb

[![Build Status](https://travis-ci.org/BlueOakJS/bos-couchdb.svg?branch=master)](https://travis-ci.org/BlueOakJS/bos-couchdb)
[![npm version](https://img.shields.io/npm/v/bos-couchdb.svg)](https://www.npmjs.com/package/bos-couchdb)

This is a [CouchDB](https://couchdb.apache.org/) service for [BlueOak Server](https://github.com/BlueOakJS/blueoak-server).
The service provides a convenient way of accessing couchdb servers through BlueOak Server.
Under the covers the service uses [nano](https://github.com/dscape/nano).

## Installation

```bash
$ npm install bos-couchdb
```

## Configuration

This service can be configured through the _couchdb_ field of the BlueOak Server config.

### Connections

Connections are named based on key specified in the `connections` section of the couchdb config block.
The configuration below defines two connections, one to a remote Cloudant server named _cloudant_ and another to a local couchdb server name _local_.

### Databases

Each connection can include on more databases defined in the `databases` field of the connection.
The key used will correspond to the name of an actual database on the couchdb server.
The configuration below defines two databases: _profiles_ belonging to the cloudant connection, and _devices_ belonging to the local connection.

```json
"couchdb": {
  "connections": {
    "cloudant": {
      "url": "https://example.cloudant.com/",
      "username": "foo",
      "password": "passw0rd",
      "databases": {
        "profiles": {}
      }
    },
    "local": {
      "url": "http://127.0.0.1:5984/",
      "databases": {
        "devices": {}
      }
    }
  }
}
```

### Scoped Config Options

Scoped config are options that can be set on the root couchdb object, the connection, or the database.
The database-specific value has precedence over the connection-specific value.
The connection-specific value has precedence over the root value.

This allows the definition of global values that can be overridden as desired.

Valid options are:

* *validateConnection* (default `true`) - verify the ability to connect to the database when the server starts.
* *createDatabase* (default `false`) - attempt to create the database if it doesn't exist when the server starts.
* *updateDesigns* (default `false`) - attempt to update the (changed) designs when the server starts.

## Managing Views

`bos-couchdb` can be used to update views (design documents) based on the content of the `couchdb` directory in your BOS project.
This makes it easier to keep these designs local to your project, in source control, as well as simplifying and standardizing their installation/update on the server(s) your BOS server connects to in every environment.
You can configure `bos-couchdb` to update any changed designs on startup by setting the *updateDesigns* config option, or on any event by calling the `updateDatabases` function.

### `couchdb/`

Designs to be mannaged by `bos-couchdb` should be placed in a tree structure in the `couchdb` directory that defines to what database they apply.

e.g.:
```
    couchdb/
        conn1/
            dba/
                designx.js
                designy.js
            dbb/
                designz.js
        conn2/
            dbc/
                designp.js
            dbd/
                designq.js
```

i.e. the design implementation for a given view will be in a BOS project at: `couchdb/$conn_name/$db_name/$design_name.js`

### Sturcture of Design Documents

The design documents to be used to update the views, either on startup with the *updateDesigns* option, or on-demand with the `updateDesigns` function, need to:

1. export an object with a key `views`
2. that contains an object named for of every view to be managed/updated
3. which has `toString()`'d functions named `map` and `reduce`

e.g., `couchdb/conn1/dba/designx.js`:
```js
module.exports = {
  views: {
    'ExampleView': {
      map: (function (doc) {
        if (!(doc.event === 'seenAnnouncement' || doc.event === 'seenBlog')) {
          emit([doc.userId, doc.campaignId], {
            timestamp: doc.timestamp, 
            event: doc.event
          });
        }
      }).toString(),
      reduce: (function (keys, values, rereduce) {
        // identicial implementation for reduce and rereduce
        values.sort(function (a, b) {
          return b.timestamp - a.timestamp;
        });
        return (values[0].event === 'resetPreferences') ? null : values[0];
      }).toString()
    }
  }
};
```

(Probably other fields from the [CouchDB design doc format](http://guide.couchdb.org/draft/design.html) can be include in the export - if you do so and confirm it works, please submit a pull request to update the docs (and tests - pretty please).)

## Usage

The bos-couchdb service can be injected into services or handlers through a `bosCouchdb` parameter on the init method.

```js
exports.init = function(config, logger, bosCouchdb) {
  ...
}
```

### getConnection(connectionName)

The `getConnection` function will return a named connection where _connectionName_ corresponds to a connection specified in the configuration.
The nano [database](https://github.com/dscape/nano#database-functions) functions can be used on the connection object.

```js
var conn = bosCouchdb.getConnection('local');
conn.list(function(err, results) {
  //results is a list of databases on the connection
});
```

### get(dbName) (getDatabase(dbName))

The `get` function will return a database where dbName corresponds to a database defined in the configuration.
The nano [document](https://github.com/dscape/nano#document-functions) functions can be used on the db object.

```js
var profilesDb = bosCouchdb.get('profiles');
profilesDb.get('foo' /*doc id*/, function(err, body) {
  if (!err)
    console.log(body);
});
```

Since it's possible that more than one connection will share a database name, the database name can be prefixed with the connection name.
This will avoid any possible ambiguity in looking up a database.

```js
var profilesDb = bosCouchdb.get('cloudant:profiles');
var devicesDb = bosCouchdb.get('local:devices');
```

### updateDesigns([designPaths], callback)

The `updateDesigns` function takes an optional array of paths to design names, e.g.:
```js
['conn1.dba.designx', 'conn2.dbd.designq']
``` 
which would cause only the designs at `couchdb/conn1/dba/designx.js` and `couchdb/conn2/dbd/designq.js` to be updated (if changed).

By default, if the `designs` parameter is not included, all designs will be updated (if changed).

The `updateDesigns` function will not change the design in the database if the local version `_.isEqual()` to the design installed on the CouchDB server.

**N.B.**: the design docs are read once at startup

### updateDesign(dbName, designName, designDoc, callback)

The `updateDesign` function allows you to pass an arbitrary design document (`designDoc` - which should be an object that follows the CouchDB design document format) and have it applied to a given database design (`designName` in database `dbName` - which, like `get()`, is an optionally connection qualified database name).