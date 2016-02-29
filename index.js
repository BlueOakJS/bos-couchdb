/*
 * Copyright (c) 2016 PointSource, LLC.
 * MIT Licensed
 */

module.exports = {
    init: init,
    get: get,
    getConnection: getConnection,
    getConnections: getConnections
};

var async = require('async');
var nano = require('nano');
var url = require('url');
var VError = require('verror');
var _ = require('lodash');
var debug = require('debug')('couchdb');
var scope = require('./lib/scope');

var connections = {}; //map connection name to the db object
var dbMap = {}; //map with key "<connName>:<dbName>" and value is the db object
var dbByName = {}; //used to look up a database without a connection name.  Looks like
//<dbName>: {
//  <connName1>: <DB Object>,
//  <connName2>: <DB Object>
// }

var cfg, logger;
var scopedConfig;

function init(config, _logger_, callback) {

    logger = _logger_;
    cfg = config.get('couchdb');
    scopedConfig = scope(cfg);

    var conns = _.keys(cfg.connections);
    debug('Initializing connections ' +  conns);
    async.forEach(conns, initConnection, function (err, res) {
        callback(err);
    });
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

function initConnection(connName, callback) {

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

    async.each(dbs, getVerifyDatabase(connName), function (err) {
        callback(err);
    });
}

function getVerifyDatabase(connName) {
    return function (dbName, callback) {
        debug('Verifying database ' + dbName + ' of connection ' + connName);
        var conn = connections[connName];

        function setupConnection() {
            //store the db object in appropriate places
            var db = conn.use(dbName);
            dbMap[connName + ':' + dbName] = db;
            if (typeof dbByName[dbName] === 'undefined') {
                dbByName[dbName] = {};
            } else {
                logger.warn('Multiple databases are using the name "%s"', dbName);
            }

            dbByName[dbName][connName] = db;
        }

        var validateConnection = scopedConfig.get('validateConnection', connName, dbName, true);

        //if false, don't bother trying to connect to the db
        if (!validateConnection) {
            setupConnection();
            return callback();
        }

        //we want to validate the connection, so attempt to connect to it
        conn.db.get(dbName, function (err, body) {
            if (err) {
                //If the DB doesn't exist, we can attempt to create it assuming createOnConnect is specified
                var createOnInit = scopedConfig.get('createDatabase', connName, dbName, false);
                if (createOnInit) {
                    conn.db.create(dbName, function (err, body) {
                        if (err) {
                            return callback(new VError(err, 'Could not create DB %s of connection %s', dbName, connName));
                        } else {
                            logger.info('Created database %s of connection %s.', dbName, connName);
                            setupConnection();
                            return callback();
                        }
                    });
                } else {
                    return callback(new VError(err, 'Could not connect to DB %s of connection %s', dbName, connName));
                }

            } else {
                setupConnection();
                return callback();
            }
        });
    };
}