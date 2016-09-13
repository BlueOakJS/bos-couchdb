var assert = require('assert');
var server = require('blueoak-server');
var fs = require('fs');
var testUtil = server.testUtility();
global.__appDir = __dirname;

/**
 * You MUST have couchdb running locally with a database called 'basic' in order for these tests to work
 */
describe('CouchDB Integration Test', function () {

    beforeEach(function () {
        couchdb = require('../../');
    });

    afterEach(function () {
        //clean up couchdb
        var name = require.resolve('../../');
        delete require.cache[name];
    });

    it('should update design documents', function (done) {
        var cfg = {
            couchdb: {
                connections: {
                    test: {
                        url: 'http://127.0.0.1:5984',
                        databases: {
                            basic: {}
                        }
                    }
                }
            }
        };
        var randomId = Math.random();
        fs.writeFileSync('./couchdb/test/basic/example.json', '{"views" : {}, "generatedId": "' + randomId + '"}');
        testUtil.initService(couchdb, cfg, function (err) {
            if (err) {
                return done(err);
            }
            var updateDesigns = couchdb.updateDesigns.bind({}, ['test.basic.example'],
                function (err, msgs) {
                    assert.ok(err === null, 'error' + err);
                    assert.equal(msgs.length, 1);
                    assert.ok(msgs[0].match(/updated to revision/));
                    done();
                });
            updateDesigns();
        });
    });

    it('should find that all design documents are identical', function (done) {
        var cfg = {
            couchdb: {
                connections: {
                    test: {
                        url: 'http://127.0.0.1:5984',
                        databases: {
                            basic: {} //returns 200 by nock
                        }
                    }
                }
            }
        };
        testUtil.initService(couchdb, cfg, function (err) {
            if (err) {
                return done(err);
            }
            var updateDesigns = couchdb.updateDesigns.bind({}, null,
                function (err, msgs) {
                    assert.ok(err === null, 'error attempting to update design doc:' + err);
                    assert.equal(msgs.length, 1);
                    assert.ok(msgs[0].match(/are identical/));
                    done();
                });
            updateDesigns();
        });
    });
});