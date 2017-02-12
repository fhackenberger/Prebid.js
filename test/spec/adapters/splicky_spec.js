// jshint esversion: 6

import { assert } from 'chai';
import { expect } from 'chai';
import * as utils from 'src/utils';
import adLoader from 'src/adloader';
import * as ajax from 'src/ajax'
import bidManager from 'src/bidmanager';
import adapter from 'src/adapters/splicky';
import CONSTANTS from 'src/constants.json';

describe('Splicky adapter', () => {
  let _adapter, sandbox, ajaxStub;
  
  function doRequest(bids) {
    _adapter.callBids({
      bids: bids
    });
  }

  const bids_video = [
    {
      bidder: 'splicky',
      bidId: 'bid-1', // Necessary to avoid a random bid id, as we need to include it in the bidResponse
      placementCode: 'code-1',
      sizes: [ [ 640, 480], [ 800, 600 ] ],
      params: {
        endpoint: 'COMPANY.splicky.com',
        publisherId: 'C1',
        publisherName: 'COMPANY',
        screenId: 'S1',
        deviceIdHash: '0000',
      },
    },
  ];

  const bidResponse1 = {
    bidid : 'a6aeb4782028260b1f7488fb0165a4a5',
    cur : 'USD',
    id : 'bid-1', // What we passed in as id in the request
    seatbid : [{
        bid : [{
            adid : 307968,
            adm : '<ad>...</ad>',
            adomain : [
              'marktjagd.de'
            ],
            cid : 940365028, // Campaign identifier
            crid : 581659343, // Creative identifier
            id : 'a6aeb4782028260b1f7488fb0165a4a5',
            impid : 1,
            iurl : 'http://static.splicky.com/a/ads/152456836/Elektro_320x50_Gruen_1.png', // Impression URL
            nurl : 'http://ue23.splicky.com/imp/TEST', // Notification URL when bid is selected  
            price : 3.01 // Cross reach CPM
        }],
        seat: 663,
    }]
  };

  describe('responses processing video', () => {
    beforeEach(() => {
      ajaxStub = sandbox.stub(ajax, 'ajax');
    });

    it('should return fully-initialized bid-response', () => {
      sandbox.stub(bidManager, 'addBidResponse'); // We'll intercept the behaviour of the addBidResponse method
      ajaxStub.onCall(0).callsArgWith(1, JSON.stringify(bidResponse1), {status: 200}); // the ajax cb handler is arg 1
      doRequest(JSON.parse(JSON.stringify(bids_video))); 
      let bidResponse = bidManager.addBidResponse.firstCall.args[1];
      expect(bidManager.addBidResponse.firstCall.args[0]).to.equal('code-1');
      expect(bidResponse.getStatusCode()).to.equal(CONSTANTS.STATUS.GOOD);
      expect(bidResponse.bidderCode).to.equal('splicky');
      expect(bidResponse.cpm).to.equal(3.01);
      expect(bidResponse.ad).to.include('<ad>...</ad>');
      expect(bidResponse.width).to.equal(640);
      expect(bidResponse.height).to.equal(480); 
    });

    it('should process empty responses', () => {
      sandbox.stub(bidManager, 'addBidResponse'); // We'll intercept the behaviour of the addBidResponse method
      ajaxStub.onCall(0).callsArgWith(1, '', {status: 204});
      doRequest(JSON.parse(JSON.stringify(bids_video))); 
      let bidResponse = bidManager.addBidResponse.firstCall.args[1];
      expect(bidManager.addBidResponse.firstCall.args[0]).to.equal('code-1');
      expect(bidResponse.getStatusCode()).to.equal(CONSTANTS.STATUS.NO_BID);
      expect(bidResponse.bidderCode).to.equal('splicky');
    });

    it('should add nurl as pixel', () => {
      sandbox.spy(utils, 'createTrackPixelHtml');
      ajaxStub.onCall(0).callsArgWith(1, JSON.stringify(bidResponse1), {status: 200}); // the ajax cb handler is arg 1
      doRequest(JSON.parse(JSON.stringify(bids_video))); 
      expect(utils.createTrackPixelHtml.calledOnce);
      let result = pbjs.getBidResponsesForAdUnitCode(bids_video[0].placementCode);
      expect(result.bids[0].ad).to.include(bidResponse1.seatbid[0].bid[0].nurl);
    });

  });

  beforeEach(() => {
    _adapter = adapter();
    utils.getUniqueIdentifierStr = () => 'callback';
    sandbox = sinon.sandbox.create(); // For easily restoring the original behaviour
  });

  afterEach(() => {
    sandbox.restore();
  });
});

function parseUrl(url) {
  const parts = url.split('/');
  const query = parts.pop().split('&');
  return {
    path: parts.join('/'),
    items: query
      .filter((i) => ! ~i.indexOf('='))
      .map((i) => fromBase64(i)
        .split('&')
        .reduce(toObject, {})),
    query: query
      .filter((i) => ~i.indexOf('='))
      .map((i) => i.replace('?', ''))
      .reduce(toObject, {})
  };
}

function fromBase64(input) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.split('');
  let bc = 0, bs, buffer, idx = 0, output = '';
  for (; buffer = input.charAt(idx++);
    ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer,
      bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0
  ) {
    buffer = chars.indexOf(buffer);
  }
  return output;
}

function toObject(cache, string) {
  const keyValue = string.split('=');
  cache[keyValue[0]] = keyValue[1];
  return cache;
}