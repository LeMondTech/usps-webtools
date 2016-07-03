// external dependencies
var request = require('request');
var builder = require('xmlbuilder');
var xml2js = require('xml2js');

// internal dependencies
var USPSError = require('./error.js');

var usps = module.exports = function (config) {
    if (!(config && config.server && config.userId)) {
        throw 'Error: must pass usps server url and userId';
    }

    this.config = config;
};

/**
 Verifies an address

 @param {Object} address The address to be verified
 @param {String} address.street1 Street
 @param {String} [address.street2] Secondary street (apartment, etc)
 @param {String} address.city City
 @param {String} address.state State (two-letter, capitalized)
 @param {String} address.zip Zipcode
 @param {Function} callback The callback function
 @returns {Object} instance of module
 */
usps.prototype.verify = function (address, callback) {
    var obj = {
        Address: {
            Address1: address.street2 || '',
            Address2: address.street1,
            City    : address.city,
            State   : address.state,
            Zip5    : address.zip,
            Zip4    : ''
        }
    };

    callUSPS('Verify', 'AddressValidateRequest', 'AddressValidateResponse.Address', this.config, obj, function (err, address) {
        if (err) {
            callback(err);
            return;
        }

        callback(null, {
            street1: address.Address2[0],
            street2: address.Address1 ? address.Address1[0] : '',
            city   : address.City[0],
            zip    : address.Zip5[0],
            state  : address.State[0]
        });
    });

    return this;
};

/**
 Looks up a zipcode, given an address

 @param {Object} address Address to find zipcode for
 @param {String} address.street1 Street
 @param {String} [address.street2] Secondary street (apartment, etc)
 @param {String} address.city City
 @param {String} address.state State (two-letter, capitalized)
 @param {String} address.zip Zipcode
 @param {Function} callback The callback function
 @returns {Object} instance of module
 */
usps.prototype.zipCodeLookup = function (address, callback) {
    var obj = {
        Address: {
            Address1: address.street2 || '',
            Address2: address.street1,
            City    : address.city,
            State   : address.state
        }
    };

    callUSPS('ZipCodeLookup', 'ZipCodeLookupRequest', 'ZipCodeLookupResponse.Address', this.config, obj, function (err, address) {
        if (err) {
            callback(err);
            return;
        }

        callback(null, {
            street1: address.Address2[0],
            street2: address.Address1 ? address.Address1[0] : '',
            city   : address.City[0],
            state  : address.State[0],
            zip    : address.Zip5[0] + '-' + address.Zip4[0]
        });
    });

    return this;
};


/**
 *
 */
usps.prototype.pricingRateV4 = function (pricingRate, callback) {
    "use strict";
    var obj = {
        Package: {
            '@ID'         : '1ST',
            Service       : pricingRate.Service || 'PRIORITY',
            ZipOrigination: pricingRate.ZipOrigination || 55401,
            ZipDestination: pricingRate.ZipDestination,
            Pounds        : pricingRate.Pounds,
            Ounces        : pricingRate.Ounces,
            Container     : pricingRate.Container,
            Size          : pricingRate.Size,
            Width         : pricingRate.Width,
            Length        : pricingRate.Length,
            Height        : pricingRate.Height,
            Girth         : pricingRate.Girth

        }
    };

    callUSPS('RateV4', 'RateV4Request', 'RateV4Response.Package', this.config, obj, function (err, lePackage) {
        if (err) {
            callback(err);
            return;
        }
        callback(null, {
            service: lePackage.Postage[0].MailService,
            rate   : lePackage.Postage[0].Rate
        });
    });
    return this;
};

/**
 *
 * @param pricingRate
 * @param callback
 * @returns {exports}
 */
usps.prototype.pricingIntlRateV2 = function (pricingRate, callback) {
    "use strict";
    var obj = {
        Revision: 2,
        Package : {
            '@ID'          : '0',
            Pounds         : pricingRate.Pounds,
            Ounces         : pricingRate.Ounces,
            MailType       : pricingRate.MailType,
            GXG            : {
                POBoxFlag: pricingRate.POBoxFlag,
                GiftFlag : pricingRate.GiftFlag
            },
            ValueOfContents: pricingRate.ValueOfContents,
            Country        : pricingRate.DestinationCountry,

            Container     : pricingRate.Container,
            Size          : pricingRate.Size,
            Width         : pricingRate.Width,
            Length        : pricingRate.Length,
            Height        : pricingRate.Height,
            Girth         : pricingRate.Girth,
            CommercialFlag: 'y'

        }
    };

    callUSPS('IntlRateV2', 'IntlRateV2Request', 'IntlRateV2Response.Package', this.config, obj, function (err, lePackage) {
        if (err) {
            callback(err);
            return;
        }
        // console.log(lePackage.Service);
        callback(null, {
            service: lePackage.Service
        });
    });
    return this;
};


/**
 City State lookup, based on zip

 @param {String} zip Zipcode to retrieve city & state for
 @param {Function} callback The callback function
 @returns {Object} instance of module
 */
usps.prototype.cityStateLookup = function (zip, callback) {
    var obj = {
        ZipCode: {
            Zip5: zip
        }
    };

    callUSPS('CityStateLookup', 'CityStateLookupRequest', 'CityStateLookupResponse.ZipCode', this.config, obj, function (err, address) {
        if (err) {
            callback(err);
            return;
        }

        callback(err, {
            city : address.City[0],
            state: address.State[0],
            zip  : address.Zip5[0]
        });
    });
};

/**
 Method to call USPS
 */
function callUSPS(api, method, resultDotNotation, config, params, callback) {
    var obj = {};
    obj[method] = params;
    obj[method]['@USERID'] = config.userId;

    var xml = builder.create(obj).end();

    // console.log(xml);

    var opts = {
        url: config.server,
        qs : {
            API: api,
            XML: xml
        }
    };

    request(opts, function (err, res, body) {
        if (err) {
            callback(new USPSError(err.message, err, {
                method: api,
                during: 'request'
            }));
            return;
        }

        xml2js.parseString(body, function (err, result) {
            var errMessage;

            if (err) {
                callback(new USPSError(err.message, err, {
                    method: api,
                    during: 'xml parse'
                }));
                return;
            }

            // may have a root-level error
            if (result.Error) {
                try {
                    errMessage = result.Error.Description[0].trim();
                } catch (err) {
                    errMessage = result.Error;
                }

                callback(new USPSError(errMessage, result.Error));
                return;
            }

            /**
             walking the result, to drill into where we want
             resultDotNotation looks like 'key.key'
             though it may actually have arrays, so returning first cell
             */
            var specificResult = result;
            var parts = resultDotNotation.split('.');

            function walkResult() {
                var key = parts.shift();

                if (key === undefined) {
                    return;
                }

                specificResult = specificResult[key];

                if (Array.isArray(specificResult)) {
                    specificResult = specificResult[0];
                }

                walkResult();
            }

            walkResult();

            // specific error handling
            if (specificResult.Error) {
                try {
                    errMessage = specificResult.Error[0].Description[0].trim();
                } catch (err) {
                    errMessage = specificResult.Error;
                }

                callback(new USPSError(errMessage, specificResult.Error));
                return;
            }

            // just peachy
            callback(null, specificResult);
        });
    });
}
