/*
 * Adapter for requesting bids from the Splicky DSP
 * To request a Splicky account for publishers
 * please get in touch at https://www.splicky.com
 * 
 * Built using the Integration Guide for Sellers Version 1.1
 * 
 * Implements OpenRTB according to Splicky documentation
 */

var utils      = require('../utils.js');
var bidfactory = require('../bidfactory.js');
var bidmanager = require('../bidmanager.js');
var adapter    = require('./adapter.js');
var constants  = require('../constants.json');
var ajax       = require('../ajax');

var ADAPTER_NAME          = 'splicky',
    SPLICKY_CALLBACK_NAME = 'splickyResponse',
    SPLICKY_REQUESTS_MAP  = 'splickyRequests',
    SPLICKY_BIDDER_CODE   = 'splicky',
    DEFAULT_REFERRER      = 'splicky.com',
    DEFAULT_CUR           = 'USD',

    // Parameters which need to be supplied for every bid
    requiredParams = ['endpoint', 'publisherId', 'publisherName', 'screenId', 'deviceIdHash'],

    requestBids = function(bidderCode, callbackName, bidReqs) {
      var ref    = utils.getTopWindowLocation(),
          bidIds = [],
          postData = {},
          callback = $$PREBID_GLOBAL$$[callbackName];

      ref = ref ? ref.host : DEFAULT_REFERRER;
      // Handles the ajax reply for each bid
      function bidResponseCb(responseText, response) {
//        console.log(ADAPTER_NAME, 'Got bid response:', response, responseText);
        if(response && response.status && response.status === 200)
          callback(200, 'success', JSON.parse(responseText));
        else
          callback(-1, 'http error ' + (response || {}).status, responseText);
      }
      // Makes it easy to provide default bid parameter values
      function getBidParamOrNull(key, paramsObj) {
        if (paramsObj && paramsObj[key])
          return paramsObj[key];
        return null;
      }
      
      for (var i = 0, l = bidReqs.length, bid, endpoint; i < l; i += 1) {
        bid = bidReqs[i];
        if (!utils.hasValidBidRequest(bid.params, requiredParams, ADAPTER_NAME))
            return; // We can't proceed without the essential parameters

        endpoint = getBidParamOrNull('endpoint', bid.params);
        postData = {}; // Build the OpenRTB json data to post to splicky
        postData.id = bid.bidId;
        postData.cur = [getBidParamOrNull('cur', bid.params) || DEFAULT_CUR];
        postData.imp = [{ id: 1}];
        postData.imp[0].bidfloor = getBidParamOrNull('floor', bid.params);
        var video = getBidParamOrNull('video', bid.params);
        if(video !== false) { // video: false disables asking for a video
          video = (!video || video === true) ? {} : video; // video: true fills in the defaults
          postData.imp[0].video = video;
          if(!video.w || !video.h) {
            postData.imp[0].video.w = bid.sizes[0][0];
            postData.imp[0].video.h = bid.sizes[0][1];
          }
          postData.imp[0].video.mimes = postData.imp[0].video.mimes || ['video/mp4'];
        }
        var banner = getBidParamOrNull('banner', bid.params);
        if(banner !== false) { // banner: false disables asking for a banner
          banner = (!banner || banner === true) ? {} : banner; // banner: true fills in the defaults
          postData.imp[0].banner = banner;
          if(!banner.w || !banner.h) {
            postData.imp[0].banner.w = bid.sizes[0][0];
            postData.imp[0].banner.h = bid.sizes[0][1];
          }
          postData.imp[0].banner.mimes = postData.imp[0].banner.mimes || ['image/jpeg', 'image/png'];
        }
        postData.imp = getBidParamOrNull('imp', bid.params) || postData.imp; // Allow the user to specify the complete imp parameter object
        postData.app = {
          ver: '1',
          name: getBidParamOrNull('screenName', bid.params) || 'Default Screen Name',
        };
        postData.app.publisher = {
          'id': getBidParamOrNull('publisherId', bid.params),
          'name': getBidParamOrNull('publisherName', bid.params),
        };
        postData.app.screen = getBidParamOrNull('screenId', bid.params);
        postData.app = getBidParamOrNull('app', bid.params) || postData.app; // Allow the user to specify the complete app parameter object
        postData.user = { ext: { impmultiplier: getBidParamOrNull('impMultiplier', bid.params) || 1 }};
        postData.user = getBidParamOrNull('user', bid.params) || postData.user; // Allow the user to specify the complete user parameter object
        postData.device = {
          didsha1: getBidParamOrNull('deviceIdHash', bid.params),
          language: getBidParamOrNull('lang', bid.params) || 'EN',
        };
        postData.device = getBidParamOrNull('device', bid.params) || postData.device; // Allow the user to specify the complete device parameter object
        var geo = getBidParamOrNull('geo', bid.params);
        if(geo)
          postData.device.geo = geo;

        // Create the bidIdsMap for easier mapping back later
        $$PREBID_GLOBAL$$[SPLICKY_REQUESTS_MAP][bidderCode][bid.bidId] = bid;
        bidIds.push(bid.bidId);
        // Send the OpenRTB request
        ajax.ajax('//' + endpoint, bidResponseCb, JSON.stringify(postData), {
          method:'POST', contentType: 'application/json', withCredentials: true 
        });
      }

      if (!bidIds.length)
        return utils.logWarn("Bad bid request params given for adapter $" + bidderCode + " (" + SPLICKY_BIDDER_CODE + ")");

    },



    registerBidResponse = function(bidderCode, rawBidResponse) {
//      console.log('Resp bid id: ' + rawBidResponse.bidid + ' id: ' + rawBidResponse.id);
      if (!rawBidResponse || !rawBidResponse.bidid || !rawBidResponse.id)
        return utils.logWarn("Splicky bid received without a response, ignoring...");

      var bidObj = $$PREBID_GLOBAL$$[SPLICKY_REQUESTS_MAP][bidderCode][rawBidResponse.id];
      if (!bidObj)
        return utils.logWarn("Splicky request not found: " + rawBidResponse.id);

      if (bidObj.bidId !== rawBidResponse.id)
        return utils.logWarn("Splicky bid received with a non matching id " + rawBidResponse.id + " instead of " + bidObj.bidId);

      if (!rawBidResponse.seatbid || rawBidResponse.seatbid.length < 1 || !rawBidResponse.seatbid[0].bid || rawBidResponse.seatbid[0].bid.length < 1)
        return utils.logWarn("Splicky bid received with no or invalid seatbid");
      
      var seatBid = rawBidResponse.seatbid[0].bid[0]; // According to splicky spec, there is only one seatBid per response
      var expectedCur = bidObj.params['cur'] || DEFAULT_CUR;
      if (rawBidResponse.cur !== expectedCur)
        return utils.logWarn("Splicky bid received with different currency: " + rawBidResponse.cur + " expected: " + expectedCur);

      var bidResponse = bidfactory.createBid(constants.STATUS.GOOD, bidObj);
      bidResponse.bidderCode = bidObj.bidder;
      bidResponse.cpm        = seatBid.price;
      // We add the bid selection notification URL to the ad, as we don't have a framework way of triggering it
      bidResponse.ad         = seatBid.adm + utils.createTrackPixelHtml(decodeURIComponent(seatBid.nurl));
      bidResponse.rawAd      = seatBid.adm;
      bidResponse.width      = bidObj.sizes[0][0];
      bidResponse.height     = bidObj.sizes[0][1];
//      console.log('Adding bidResponse for placement ' + bidObj.placementCode, bidResponse);
      bidmanager.addBidResponse(bidObj.placementCode, bidResponse);
      $$PREBID_GLOBAL$$[SPLICKY_REQUESTS_MAP][bidderCode][rawBidResponse.id].responded = true;
    },



    registerSplickyCallback = function(bidderCode, callbackName) {
      $$PREBID_GLOBAL$$[callbackName] = function(status, statusStr, rtkResponseObj) {
//        console.log(ADAPTER_NAME, 'Callback invoked with: ', status, statusStr, rtkResponseObj);
        registerBidResponse(bidderCode, rtkResponseObj);

        // Make sure we provide a response, even if registerBidResponse could not process the result
        for (var bidRequestId in $$PREBID_GLOBAL$$[SPLICKY_REQUESTS_MAP][bidderCode]) {
          if ($$PREBID_GLOBAL$$[SPLICKY_REQUESTS_MAP][bidderCode].hasOwnProperty(bidRequestId)) {
            var bidRequest = $$PREBID_GLOBAL$$[SPLICKY_REQUESTS_MAP][bidderCode][bidRequestId];
            if (!bidRequest.responded) {
              var bidResponse = bidfactory.createBid(constants.STATUS.NO_BID, bidRequest);
              bidResponse.bidderCode = bidRequest.bidder;
              bidmanager.addBidResponse(bidRequest.placementCode, bidResponse);
            }
          }
        }
      };
    },



    SplickyAdapter = function() {
      var baseAdapter = adapter.createNew(SPLICKY_BIDDER_CODE);

      $$PREBID_GLOBAL$$[SPLICKY_REQUESTS_MAP] = $$PREBID_GLOBAL$$[SPLICKY_REQUESTS_MAP] || {};

      baseAdapter.callBids = function (params) {
        var bidderCode   = baseAdapter.getBidderCode(),
            callbackName = SPLICKY_CALLBACK_NAME;

        if (bidderCode !== SPLICKY_BIDDER_CODE)
          callbackName = [SPLICKY_CALLBACK_NAME, bidderCode].join('_');

        $$PREBID_GLOBAL$$[SPLICKY_REQUESTS_MAP][bidderCode] = {};

        registerSplickyCallback(bidderCode, callbackName);

        return requestBids(bidderCode, callbackName, params.bids || []);
      };

      return {
        callBids:      baseAdapter.callBids,
        setBidderCode: baseAdapter.setBidderCode,
        createNew:     exports.createNew
      };
    };



exports.createNew = function() {
  return new SplickyAdapter();
};

module.exports = SplickyAdapter;
