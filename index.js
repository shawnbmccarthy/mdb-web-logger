/*
 * exressjs logger middleware
 * A simple middleware component which will write access logs to mongodb allowing for
 * analysis of data
 *
 * TODO: schema is hardcoded at this time
 */
var MongoClient = require('mongodb').MongoClient;
var onfinished  = require('on-finished');
var onheaders   = require('on-headers');

module.exports = loggermdb;

function loggermdb(options){
    var opts = options || {};

    /*
     * setup defaults
     */
    var hosts        = opts.hosts            || 'localhost:27017';
    var user         = opts.user             || '';
    var pw           = opts.password         || '';
    var authdb       = opts.auth_source      || '';
    var auth_mech    = opts.auth_mech        || 'SCRAM-SHA-1';
    var gssapi_name  = opts.gssapi_name      || 'mongodb';
    var usessl       = opts.usessl           || false;
    var replica      = opts.replica          || '';
    var db           = opts.db               || 'loggerdb';
    var coll         = opts.collection       || 'express';
    var level        = opts.log_level        || 'info';
    var enabled      = opts.enabled          || true;
    var wconcern     = opts.write_concern    || 0;
    var wtimeout     = opts.write_timeout    || 10;
    var bulk_sz      = opts.bulk_sz          || 10;

    /*
     * handle to connected database
     */
    var mdb = undefined;
    var cache = [];
    var collection = undefined;

    /*
     *
     */
    var createConnection = function(){
        var murl, login = '', am = '', as = '', rs = '', ssl = '';
        if(user !== '' && pw !== ''){
            login = user + ':' + pw + '@';
            if(authdb !== ''){
                as = 'authSource=' + authdb;
            }
            am = 'authMechanism=' + auth_mech;
        }
        murl = 'mongodb://' + login + hosts + '/' + db;
        if(replica !== ''){
            rs = 'replicaSet=' + replica;
        }

        if(usessl){
            ssl = 'ssl=true';
        }

        MongoClient.connect(murl, {}, function(err, database) {
            if (err) {
                console.log('ERROR: could not connect to mongodb, throwing error');
                throw err;
            }
            mdb = database;
            collection = mdb.collection(coll);
        });
    };

    createConnection();

    return function logger(req, res, next){
        // request data
        req._startAt = undefined;
        req._startTime = undefined;

        // response data
        res._startAt = undefined;
        res._startTime = undefined;

        var accessLog = {};

        /*
         * log request to mongodb
         */
        function logRequest() {
            accessLog['log_level'] = 'INFO';
            accessLog['client'] = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
            accessLog['ip'] = req.ip || req._remoteAddress || (req.connection && req.connection.remoteAddress);
            accessLog['method'] = req.method;
            accessLog['url'] = req.url;
            accessLog['version'] = 'HTTP/' + req.httpVersionMajor + '.' + req.httpVersionMinor;
            accessLog['agent'] = req.headers['user-agent'];
            accessLog['referrer'] = req.headers['referer'] || req.headers['referrer'];
            accessLog['protocol'] = req.protocol;
            accessLog['status'] = res.statusCode;
            accessLog['date'] = new Date();
            cache.push(accessLog);
            if(cache.length === 1){
                for(var i = 0; i < cache.length; i++){
                    collection.insertOne(cache[i], function(err, r){
                        if(err){
                            console.log('error: ' + err + ', r: ' + r);
                        }
                    });
                }
                cache = [];
            }
        }

        /*
         * only execute if logging is enabled
         */
        if(enabled){
            onfinished(res, logRequest);
        }

        next();
    };
}
