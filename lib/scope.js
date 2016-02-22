/*
 * Copyright (c) 2016 PointSource, LLC.
 * MIT Licensed
 */

/*
 * This is a simple library for allowing scoped config.
 * Imagine a value that can be defined either on the database, connection, or root-level.
 *
 * {
 *   prop: 'globalValue',
 *   connections: {
 *     conn1: {
 *       prop: 'connValue',
 *       databases: {
 *         db1: {
 *           prop: 'dbValue'
 *         }
 *       }
 *     }
 *   }
 * }
 *
 *  We want the more-specifically scoped value to override the less-specifically-scoped value.
 *  In the example above, the value of 'prop' will be dbValue.
 *  If dbValue isn't set, it will be 'connValue'.  And if connValue isn't set it will be 'globalValue'.
 */
module.exports = function(cfg) {

    return {
        get: function(key, connName, dbName, defaultValue) {

            //First try to get the db-scoped value
            if (typeof dbName !== 'undefined' && dbName !== null) {
                var dbVal = cfg.connections[connName].databases[dbName];
                if (typeof dbVal[key] !== 'undefined') {
                    return dbVal[key];
                }
            }

            //Second try to get the connection-scoped value
            if (typeof connName !== 'undefined' && connName !== null) {
                var connVal = cfg.connections[connName];
                if (typeof connVal[key] !== 'undefined') {
                    return connVal[key];
                }
            }

            //Third, try to get the global-scoped value
            if (typeof cfg[key] !== 'undefined') {
                return cfg[key];
            }

            //Last, return default value
            return defaultValue;
        }
    }
};

