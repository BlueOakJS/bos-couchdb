/*
 * Copyright (c) 2016 PointSource, LLC.
 * MIT Licensed
 */

module.exports = {
    init: init,
    get: get,
    getConnection: getConnection,
    getConnections: getConnections,
    getDatabase: get,
    getDatabaseNames: getDatabaseNames,
    updateDesign: updateDesign,
    updateDesigns: updateDesigns
};

var nano = require('nano');
var path = require('path');
var requireDir = require('require-dir');
var url = require('url');
var VError = require('verror');
var _ = require('lodash');
var debug = require('debug')('bos-couchdb');
var scope = require('./lib/scope');
var util = require('util');
var Q = require('q');

var designs = {}; //map representing the 'couchdb' directory in the BOS project
var connections = {}; //map connection name to the db object
var dbMap = {}; //map with key "<connName>:<dbName>" and value is the db object
var dbByName = {}; //used to look up a database without a connection name.  Looks like
//<dbName>: {
//  <connName1>: <DB Object>,
//  <connName2>: <DB Object>
// }

var cfg, log;
var scopedConfig;

function init(config, logger, callback) {

    log = logger;
    cfg = config.get('couchdb');
    scopedConfig = scope(cfg);

    try {
        designs = requireDir(path.join(global.__appDir, 'couchdb'), { recurse: true });
    } catch (err) {
        log.error('Failed loading designs from "couchdb/": %s\nupdateDesigns will not be available.', err);
    }

    var conns = _.keys(cfg.connections);
    debug('Initializing connections ' +  conns);
    var initConnPromises = [];
    conns.forEach(function (conn) {
        initConnPromises.push(_initConnection(conn));
    });
    Q.all(initConnPromises).nodeify(callback);
}

//return the db connection (nano) object directly
/**
 * Get a connection.
 *
 * @param  {string} connName - The name of the connection to retrieve.
 *
 * @return {Object} The `nano` connection object.
 */
function getConnection(connName) {
    return connections[connName];
}

/**
 * Get all the connections.
 */
function getConnections() {
    return connections;
}

/**
 * Get the names of all databases.
 */
function getDatabaseNames() {
    return Object.keys(dbMap);
}

/*
 * Get a database.
 *
 * @param  {string} name - The name can either be of the form "<connName>:<dbName>",
 *  e.g. "myCloudantDb:users", or it can simply be the db name, e.g. "users".
 *  In the case that there are two connections
 *
 * @return {Object} The `nano` database object.
 */
function get(name) {
    debug('Getting database ' + name);

    if (name.indexOf(':') > -1) {
        return dbMap[name];
    } else { //no connection info specified
        var conns = dbByName[name];
        var keys = _.keys(conns);

        if (keys.length > 1) {
            throw new VError('The database name "%s" is ambiguous for connections %s.', name, keys.join(', '));
        }

        return conns[keys[0]];
    }
}

function _initConnection(connName, callback) {

    var connCfg = cfg.connections[connName];
    var connUrl = connCfg.url;

    //embed the username and password into the URL, e.g. http://<username>:<password>@...
    if (connCfg.username && connCfg.password) {
        var urlData = url.parse(connUrl);
        if (urlData.auth === null) {
            urlData.auth = connCfg.username + ':' + connCfg.password;
            connUrl = url.format(urlData);
        }
    }
    var conn = nano(connUrl);
    connections[connName] = conn;

    var dbs = _.keys(connCfg.databases) || [];
    var verifyDbPromises = [];
    dbs.forEach(function (db) {
        verifyDbPromises.push(_getVerifyDatabase(connName)(db));
    });
    return Q.all(verifyDbPromises).nodeify(callback);
}

function _getVerifyDatabase(connName) {
    return function (dbName) {
        debug('Verifying database ' + dbName + ' of connection ' + connName);
        var conn = connections[connName];
        var validateConnection = scopedConfig.get('validateConnection', connName, dbName, true);

        //if false, don't bother trying to connect to the db
        if (!validateConnection) {
            return __setupConnection();
        }
        //we want to validate the connection, so attempt to connect to it
        var deferred = Q.defer();
        conn.db.get(dbName, function (err, body) {
            if (!err) {
                debug('Verification response for database %s:%s: %s', connName, dbName, JSON.stringify(body, null, 2));
                deferred.resolve(__setupConnection());
            }
            //If the DB doesn't exist, we can attempt to create it assuming createOnConnect is specified
            var createOnInit = scopedConfig.get('createDatabase', connName, dbName, false);
            if (createOnInit) {
                var createPromise = Q.npost(conn.db, 'create', [dbName])
                .then(function (body) {
                    log.info('Created database %s of connection %s.', dbName, connName);
                    debug('Creation response for database %s:%s: %s', connName, dbName, JSON.stringify(body, null, 2));
                    return __setupConnection();                   
                })
                .catch(function (err) {
                    throw new VError(err, 'Could not create DB %s on connection %s', dbName, connName);
                });
                deferred.resolve(createPromise);
            } else {
                deferred.reject(new VError(err, 'Could not connect to DB %s on connection %s', dbName, connName));
            }         
        });
        return deferred.promise;


        function __setupConnection() {
            //store the db object in appropriate places
            var db = conn.use(dbName);
            var qualifiedDbName = connName + ':' + dbName;
            dbMap[qualifiedDbName] = db;
            if (typeof dbByName[dbName] === 'undefined') {
                dbByName[dbName] = {};
            } else {
                log.warn('Multiple databases are using the name "%s"', dbName);
            }

            dbByName[dbName][connName] = db;

            if (scopedConfig.get('updateDesigns', connName, dbName, false)) {
                var dbDesigns = _.get(designs, qualifiedDbName.replace(':', '.'));
                if (dbDesigns) {
                    var updateDesignPromises = [];
                    Object.keys(dbDesigns).forEach(function (designName) {
                        updateDesignPromises.push(updateDesign(qualifiedDbName, designName, dbDesigns[designName]));
                    });
                    return Q.all(updateDesignPromises);
                } else {
                    log.warn('No designs found to update database %s as requested by "updateDesigns" option.', qualifiedDbName);
                }
            }
            return Q();
        }
    };
}

function updateDesigns(designPaths) {
    if (!designPaths) {
        designPaths = [];
        Object.keys(dbMap).forEach(function (dbName) {
            var dbPath = dbName.replace(':', '.');
            Object.keys(_.get(designs, dbPath)).forEach(function (designName) {
                designPaths.push(dbPath + '.' + designName);
            });
        });
    }
    if (!(Array.isArray(designPaths))) {
        var msg = 'Invalid parameters';
        log.error(msg);
        throw new VError(msg);
    }
    // everything looks good, we're ready to update any designs that need it
    var updateDesignPromises = [];
    designPaths.forEach(function (designPath) {
        var design = _.get(designs, designPath);
        var parts = designPath.split('.');
        if (!design) {
            log.warn('skipping unknown design ' + designPath);
        } else {
            updateDesignPromises.push(updateDesign(parts[0] + ':' + parts[1], parts[2], design));
        }
    });
    if (updateDesignPromises.length === 0) {
        return Q('no design paths match a design found in couchdb directory');
    }
    return Q.allSettled(updateDesignPromises);
}

function updateDesign(dbName, designName, designDoc) {
    var nanoDb = get(dbName);
    if (!nanoDb) {
        return Q.reject(new VError('Unknown Database ("%s" is not configured)', dbName));
    } else if (typeof designName !== 'string') {
        return Q.reject(new VError('A design name string must be provided to update a database\'s design'));
    } else if (typeof designDoc !== 'object') {
        return Q.reject(new VError('A design document object must be provided to update a database\'s design'));
    }
    var deferred = Q.defer();
    debug('Doing update design for design document %s.%s (database.design)', dbName, designName);
    nanoDb.get('_design/' + designName, function (err, doc) {
        if (err) {
            debug('Error getting existing design document (%s.%s), will try to create it.\n(error: %s)', dbName, designName, err);
        } else if (doc) {
            debug('Found original design document (%s.%s), revision: %s', dbName, designName, doc._rev);
            designDoc._rev = doc._rev;
            delete doc._id;
            if (_.isEqual(designDoc, doc)) {
                var msg = util.format('Design documents (%s.%s) are identical, no update to be made.', dbName, designName);
                debug(msg);
                deferred.resolve(msg);
            }
        }
        nanoDb.insert(designDoc, '_design/' + designName, function (err, body) {
            var msg;
            if (err) {
                msg = util.format('Error inserting the new design document (%s.%s): %s', dbName, designName, err);
                debug(msg);
                deferred.reject(new VError.WError(err, msg));
            } else {
                msg = util.format('Design document (%s.%s) updated to revision %s.', dbName, designName, body.rev);
                debug(msg);
                deferred.resolve(msg);
            }
        });
    });
    return deferred.promise;
}
