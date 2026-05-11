import { NextResponse } from 'next/server';
import { kv } from '@/lib/kv';

const SEED_DOMAINS = [
  'cityofhope.org','habitatla.org','freedomhouse.org','pih.org','care.org',
  'oxfamamerica.org','savethechildren.org','mercycorps.org','directrelief.org',
  'kippla.org','teachforamerica.org','khanacademy.org','collegetrack.org',
  'youthuprise.org','firstplace4youth.org','bigbrothers.org','ymcaboston.org',
  'unitedway.org','redcross.org','goodwill.org','techcrunch.com','mashable.com',
  'readwriteweb.com','gigaom.com','venturebeat.com','boingboing.net',
  'lifehacker.com','gizmodo.com','engadget.com','joystiq.com','autoblog.com',
  'consumerist.com','deadspin.com','kotaku.com','looksmart.com','friendster.com',
  'bebo.com','imeem.com','brightkite.com','loopt.com','upcoming.org',
  'eventful.com','crowdvine.com','ning.com','wetpaint.com','wikispaces.com',
  'pbwiki.com','zoho.com','drupalgardens.com','wpmu.org','buddypress.org',
  'civicrm.org','openbravo.com','gracechurch.org','trinitychurch.org',
  'calvarychapel.org','cornerstonechurch.org','newlifechurch.org','hopechurch.org',
  'crossroadschurch.org','elevationchurch.org','saddleback.com','watermark.org',
  'northpointministries.org','mountainviewchurch.org','lakewoodchurch.org',
  'fellowshipchurch.org','ridgewoodchurch.org','crosswaychurch.org',
  'gracepointchurch.org','thevillagechurch.net','harvestchurch.org',
  'vineyardchurch.org','alliancechurch.org','bethanybc.org','calvarybc.org',
  'lakesidevillage.org','sunsetterrace.org','maplewood-hoa.org',
  'creeksidecommons.org','stonebridgehoa.org','localfc.org','triclubsf.org',
  'bikeclubla.org','pixelcreative.com','bluerock.biz','clearpath.net',
  'apexstrategy.com','northstar.biz','meridiangroup.net','trueblue.com',
  'redshift.biz','greenpath.org','sierraclub.org','audubon.org',
  'earthjustice.org','nwf.org','earthday.org','lwv.org','commoncause.org',
  'publiccitizen.org','nami.org','artscenter.org','theatercompany.org',
  'museumsociety.org','artguild.org','filmfest.org','rotary5000.org',
  'kiwanis-district.org','lionsclub-intl.org','toastmasters-area.org',
  'dentalassociation.org','medicalassociation.org','barassociation.org',
  'realtorsassociation.org','nursesassociation.org',
  'localcouncil.org.uk','villageclub.org.uk','parishchurch.org.uk',
  'communitycentre.org.au','localclub.org.au','sportsclub.org.au',
  'beachvolleyball.org.au','rugbyclub.org.au',
].map(d => d.toLowerCase());

export async function GET() {
  const existing: string[] = (await kv.get('domains')) || [];
  const existingSet = new Set(existing);
  const newDomains = SEED_DOMAINS.filter(d => !existingSet.has(d));
  const merged = [...existing, ...newDomains];
  await kv.set('domains', merged);
  return NextResponse.json({ seeded: newDomains.length, total: merged.length });
}
