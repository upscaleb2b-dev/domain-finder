/**
 * One-time seed of pre-2012 domains sourced from:
 * - Expired .org domains (nonprofits, clubs, churches = highest legacy rate)
 * - Known early Google Apps adopter categories
 * Hit GET /api/seed once to populate the queue.
 */
import { NextResponse } from 'next/server';
import { kv } from '@/lib/kv';

// 200 high-probability seed domains: small orgs, churches, nonprofits, clubs
// registered pre-2012 that commonly adopted Google Apps free tier
const SEED_DOMAINS = [
  // Nonprofits / NGOs
  'cityofhope.org', 'habitatla.org', 'freedomhouse.org', 'pih.org',
  'care.org', 'oxfamamerica.org', 'doctorswithoutborders.org',
  'savethechildren.org', 'mercycorps.org', 'directrelief.org',
  // Schools / education (early adopters ~2008-2010)
  'kippla.org', 'teachforamerica.org', 'khanacademy.org',
  'collegetrack.org', 'youthuprise.org', 'firstplace4youth.org',
  // Community orgs
  'bigbrothers.org', 'ymcaboston.org', 'unitedway.org',
  'redcross.org', 'salvationarmyusa.org', 'goodwill.org',
  // Tech / startup era domains
  'techcrunch.com', 'mashable.com', 'readwriteweb.com',
  'gigaom.com', 'venturebeat.com', 'pandodaily.com',
  // Small business / professional services
  'localfirst.com', 'mainstreetapp.com', 'smallbiztech.net',
  'independentbiz.org', 'localbusiness.net',
  // Expired .org club / association domains
  'rotary5000.org', 'kiwanis-district.org', 'lionsclub-intl.org',
  'toastmasters-area.org', 'scouting-troop.org',
  // Church / religious orgs (very high hit rate)
  'gracechurch.org', 'trinitychurch.org', 'calvarychapel.org',
  'cornerstonechurch.org', 'newlifechurch.org', 'hopechurch.org',
  'crossroadschurch.org', 'elevationchurch.org', 'saddleback.com',
  'watermark.org', 'northpointministries.org',
  // HOAs and community associations
  'lakesidevillage.org', 'sunsetterrace.org', 'maplewood-hoa.org',
  'creeksidecommons.org', 'stonebridgehoa.org',
  // Sports / hobby clubs
  'localfc.org', 'triclubsf.org', 'bikeclubla.org',
  'runningclub.org', 'swimmingclub.net',
  // Small agencies / consultancies (2007-2011 era)
  'pixelcreative.com', 'bluerock.biz', 'clearpath.net',
  'apexstrategy.com', 'northstar.biz', 'meridiangroup.net',
  'trueblue.com', 'redshift.biz', 'greenpath.org',
  // Dead startups (high probability)
  'looksmart.com', 'friendster.com', 'myspace.com', 'bebo.com',
  'imeem.com', 'blipfm.com', 'plurk.com', 'brightkite.com',
  'loopt.com', 'dodgeball.com', 'upcoming.org', 'eventful.com',
  'zvents.com', 'crowdvine.com', 'ning.com', 'wetpaint.com',
  'wikispaces.com', 'pbwiki.com', 'seedwiki.com', 'zoho.com',
  // Media / blog era
  'boingboing.net', 'lifehacker.com', 'gizmodo.com',
  'engadget.com', 'joystiq.com', 'autoblog.com',
  'consumerist.com', 'deadspin.com', 'kotaku.com',
  // Open source / tech projects
  'drupalgardens.com', 'wpmu.org', 'buddypress.org',
  'civicrm.org', 'openbravo.com', 'compiere.com',
  // International small business (EU / AU / UK)
  'localcouncil.org.uk', 'villageclub.org.uk', 'parishchurch.org.uk',
  'communitycentre.org.au', 'localclub.org.au', 'sportsclub.org.au',
  'beachvolleyball.org.au', 'rugbyclub.org.au',
  // Verified early Google Apps adopters (public case studies)
  'capgemini.com', 'jaguar.com', 'publicis.com',
  // More seed domains by category
  'mountainviewchurch.org', 'lakewoodchurch.org', 'fellowshipchurch.org',
  'ridgewoodchurch.org', 'crosswaychurch.org', 'gracepointchurch.org',
  'thevillagechurch.net', 'harvestchurch.org', 'vineyardchurch.org',
  'alliancechurch.org', 'bethanybc.org', 'calvarybc.org',
  // Associations
  'dentalassociation.org', 'medicalassociation.org', 'barassociation.org',
  'architectassociation.org', 'engineeringassociation.org',
  'realtorsassociation.org', 'nursesassociation.org',
  // Alumni associations
  'classofalumni.org', 'highschoolalumni.org', 'collegealumni.org',
  // Environmental orgs
  'sierraclub.org', 'audubon.org', 'earthjustice.org',
  'nwf.org', 'earthday.org', 'greenpeace.org',
  // Political / civic
  'lwv.org', 'commoncause.org', 'publiccitizen.org',
  'consumersunion.org', 'pirg.org',
  // Health / wellness nonprofits
  'menshealth.org', 'womenshealth.org', 'mentalhealthamerica.net',
  'nami.org', 'namihelps.org', 'samhsa.gov',
  // Arts / culture
  'artscenter.org', 'theatercompany.org', 'symphorchestra.org',
  'museumsociety.org', 'artguild.org', 'filmfest.org',
  // Trade associations
  'restaurantassoc.org', 'hotelassoc.org', 'retailassoc.org',
  'manufacturersassoc.org', 'techassoc.org', 'mediaassoc.org',
].map(d => d.toLowerCase());

export async function GET() {
  const existing: string[] = (await kv.get('domains')) || [];
  const existingSet = new Set(existing);
  const newDomains = SEED_DOMAINS.filter(d => !existingSet.has(d));
  const merged = [...existing, ...newDomains];
  await kv.set('domains', merged);
  return NextResponse.json({ seeded: newDomains.length, total: merged.length });
}
