import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set both environment variables before running the seed script.'
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const TARGET_USERS = [
  {
    email: 'pit@gmail.com',
    password: 'pass123',
    profile: { full_name: 'Petar Ivanov', phone: '+35970010001', email: 'pit@gmail.com' },
  },
  {
    email: 'maria@gmail.com',
    password: 'pass123',
    profile: { full_name: 'Maria Petrova', phone: '+35970010002', email: 'maria@gmail.com' },
  },
  {
    email: 'stevenak@gmail.com',
    password: 'pass123',
    profile: { full_name: 'Steven Aleksandrov', phone: '+35970010003', email: 'stevenak@gmail.com' },
  },
];

const AUX_OWNER_USERS = [
  { email: 'owner4.sample@mydom.local', password: 'pass123' },
  { email: 'owner5.sample@mydom.local', password: 'pass123' },
  { email: 'owner6.sample@mydom.local', password: 'pass123' },
  { email: 'owner7.sample@mydom.local', password: 'pass123' },
];

async function ensureUser(email, password) {
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;

    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;

    if (data.users.length < 200) break;
    page += 1;
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError) throw createError;
  return created.user;
}

async function run() {
  console.log('Seeding sample data...');

  const ensuredTargetUsers = [];
  for (const target of TARGET_USERS) {
    const user = await ensureUser(target.email, target.password);
    ensuredTargetUsers.push({ ...target, id: user.id });
  }

  const auxOwners = [];
  for (const aux of AUX_OWNER_USERS) {
    const user = await ensureUser(aux.email, aux.password);
    auxOwners.push({ ...aux, id: user.id });
  }

  const allSeedUserIds = [...ensuredTargetUsers, ...auxOwners].map((user) => user.id);

  const { error: userRolesError } = await supabase
    .from('user_roles')
    .upsert(
      ensuredTargetUsers.map((user) => ({ user_id: user.id, role: 'user' })),
      { onConflict: 'user_id' }
    );
  if (userRolesError) throw userRolesError;

  const { error: profilesError } = await supabase
    .from('profiles')
    .upsert(
      ensuredTargetUsers.map((user) => ({
        user_id: user.id,
        full_name: user.profile.full_name,
        phone: user.profile.phone,
        email: user.profile.email,
      })),
      { onConflict: 'user_id' }
    );
  if (profilesError) throw profilesError;

  const independentObjects = [
    { number: 'A101', floor: 1, owner_user_id: ensuredTargetUsers[0].id, square_meters: 82.5, tenants_count: 2, contact_email: 'pit@gmail.com', contact_phone: '+35970010001' },
    { number: 'A102', floor: 1, owner_user_id: ensuredTargetUsers[0].id, square_meters: 74.2, tenants_count: 1, contact_email: 'pit@gmail.com', contact_phone: '+35970010001' },
    { number: 'B201', floor: 2, owner_user_id: ensuredTargetUsers[1].id, square_meters: 90.0, tenants_count: 3, contact_email: 'maria@gmail.com', contact_phone: '+35970010002' },
    { number: 'B202', floor: 2, owner_user_id: ensuredTargetUsers[1].id, square_meters: 68.7, tenants_count: 2, contact_email: 'maria@gmail.com', contact_phone: '+35970010002' },
    { number: 'C301', floor: 3, owner_user_id: ensuredTargetUsers[2].id, square_meters: 77.4, tenants_count: 2, contact_email: 'stevenak@gmail.com', contact_phone: '+35970010003' },
    { number: 'C302', floor: 3, owner_user_id: ensuredTargetUsers[2].id, square_meters: 95.9, tenants_count: 4, contact_email: 'stevenak@gmail.com', contact_phone: '+35970010003' },
    { number: 'D401', floor: 4, owner_user_id: auxOwners[0].id, square_meters: 88.8, tenants_count: 2, contact_email: 'owner4.sample@mydom.local', contact_phone: '+35970010004' },
    { number: 'D402', floor: 4, owner_user_id: auxOwners[1].id, square_meters: 69.1, tenants_count: 1, contact_email: 'owner5.sample@mydom.local', contact_phone: '+35970010005' },
    { number: 'E501', floor: 5, owner_user_id: auxOwners[2].id, square_meters: 102.3, tenants_count: 3, contact_email: 'owner6.sample@mydom.local', contact_phone: '+35970010006' },
    { number: 'E502', floor: 5, owner_user_id: auxOwners[3].id, square_meters: 79.6, tenants_count: 2, contact_email: 'owner7.sample@mydom.local', contact_phone: '+35970010007' },
  ];

  const { error: objectsError } = await supabase
    .from('independent_objects')
    .upsert(independentObjects, { onConflict: 'number' });
  if (objectsError) throw objectsError;

  const objectNumbers = independentObjects.map((objectItem) => objectItem.number);
  const { data: objectRows, error: objectsFetchError } = await supabase
    .from('independent_objects')
    .select('id,number')
    .in('number', objectNumbers);
  if (objectsFetchError) throw objectsFetchError;

  const objectIdByNumber = new Map(objectRows.map((row) => [row.number, row.id]));

  const obligationsSeed = [
    { year: 2025, month: 1, objectNumber: 'A101', rate: 90.0 },
    { year: 2025, month: 2, objectNumber: 'A102', rate: 88.0 },
    { year: 2025, month: 3, objectNumber: 'B201', rate: 95.0 },
    { year: 2025, month: 4, objectNumber: 'B202', rate: 86.0 },
    { year: 2025, month: 5, objectNumber: 'C301', rate: 91.0 },
    { year: 2025, month: 6, objectNumber: 'C302', rate: 98.0 },
    { year: 2025, month: 7, objectNumber: 'D401', rate: 87.0 },
    { year: 2025, month: 8, objectNumber: 'E501', rate: 99.0 },
  ].map((item) => ({
    year: item.year,
    month: item.month,
    independent_object_id: objectIdByNumber.get(item.objectNumber),
    rate: item.rate,
  }));

  const missingObject = obligationsSeed.find((obligation) => !obligation.independent_object_id);
  if (missingObject) {
    throw new Error('Could not resolve one or more independent object IDs for obligations seeding.');
  }

  const { error: obligationsError } = await supabase
    .from('payment_obligations')
    .upsert(obligationsSeed, { onConflict: 'year,month,independent_object_id' });
  if (obligationsError) throw obligationsError;

  const { data: obligationsRows, error: obligationsFetchError } = await supabase
    .from('payment_obligations')
    .select('id,year,month,independent_object_id')
    .eq('year', 2025)
    .in('independent_object_id', [...objectIdByNumber.values()]);
  if (obligationsFetchError) throw obligationsFetchError;

  const obligationByKey = new Map(
    obligationsRows.map((row) => [
      `${row.year}-${String(row.month).padStart(2, '0')}-${row.independent_object_id}`,
      row.id,
    ])
  );

  const paidSet = new Set([
    `2025-01-${objectIdByNumber.get('A101')}`,
    `2025-03-${objectIdByNumber.get('B201')}`,
    `2025-05-${objectIdByNumber.get('C301')}`,
  ]);

  const paymentsSeed = obligationsSeed.map((obligation) => {
    const key = `${obligation.year}-${String(obligation.month).padStart(2, '0')}-${obligation.independent_object_id}`;
    const isPaid = paidSet.has(key);

    return {
      payment_obligation_id: obligationByKey.get(key),
      status: isPaid ? 'paid' : 'not paid',
      date: isPaid ? `2025-${String(obligation.month).padStart(2, '0')}-15` : null,
      marked_by_user_id: isPaid ? ensuredTargetUsers[(obligation.month - 1) % ensuredTargetUsers.length].id : null,
    };
  });

  const missingObligationPayment = paymentsSeed.find((payment) => !payment.payment_obligation_id);
  if (missingObligationPayment) {
    throw new Error('Could not resolve one or more obligation IDs for payments seeding.');
  }

  const { error: paymentsError } = await supabase
    .from('payments')
    .upsert(paymentsSeed, { onConflict: 'payment_obligation_id' });
  if (paymentsError) throw paymentsError;

  const sampleEventTitles = ['[SAMPLE] Building General Assembly', '[SAMPLE] Elevator Maintenance', '[SAMPLE] Roof Inspection'];

  const { error: deleteEventsError } = await supabase
    .from('events')
    .delete()
    .in('title', sampleEventTitles);
  if (deleteEventsError) throw deleteEventsError;

  const eventsSeed = [
    {
      title: '[SAMPLE] Building General Assembly',
      description: 'Monthly meeting for budget, repairs and building decisions.',
      created_by: ensuredTargetUsers[0].id,
    },
    {
      title: '[SAMPLE] Elevator Maintenance',
      description: 'Scheduled maintenance by certified external contractor.',
      created_by: ensuredTargetUsers[1].id,
    },
    {
      title: '[SAMPLE] Roof Inspection',
      description: 'Preventive inspection before autumn rainy season.',
      created_by: ensuredTargetUsers[2].id,
    },
  ];

  const { error: eventsInsertError } = await supabase.from('events').insert(eventsSeed);
  if (eventsInsertError) throw eventsInsertError;

  const sampleDiscussionTitles = ['[SAMPLE] Parking Rules Update', '[SAMPLE] Intercom Replacement'];

  const { data: previousDiscussions, error: previousDiscussionsError } = await supabase
    .from('discussions')
    .select('id,title')
    .in('title', sampleDiscussionTitles);
  if (previousDiscussionsError) throw previousDiscussionsError;

  if (previousDiscussions.length > 0) {
    const { error: deleteMessagesError } = await supabase
      .from('messages')
      .delete()
      .in('discussion_id', previousDiscussions.map((item) => item.id));
    if (deleteMessagesError) throw deleteMessagesError;

    const { error: deleteDiscussionsError } = await supabase
      .from('discussions')
      .delete()
      .in('id', previousDiscussions.map((item) => item.id));
    if (deleteDiscussionsError) throw deleteDiscussionsError;
  }

  const discussionsSeed = [
    {
      title: '[SAMPLE] Parking Rules Update',
      description_html: '<p>Proposal to update parking rules in the inner yard and mark guest slots.</p>',
      created_by: ensuredTargetUsers[0].id,
    },
    {
      title: '[SAMPLE] Intercom Replacement',
      description_html: '<p>Comparing offers for replacing the main entrance intercom system.</p>',
      created_by: ensuredTargetUsers[1].id,
    },
  ];

  const { data: insertedDiscussions, error: discussionsInsertError } = await supabase
    .from('discussions')
    .insert(discussionsSeed)
    .select('id,title');
  if (discussionsInsertError) throw discussionsInsertError;

  const parkingDiscussion = insertedDiscussions.find((item) => item.title === '[SAMPLE] Parking Rules Update');
  const intercomDiscussion = insertedDiscussions.find((item) => item.title === '[SAMPLE] Intercom Replacement');

  const messagesSeed = [
    {
      discussion_id: parkingDiscussion.id,
      owner_user_id: ensuredTargetUsers[1].id,
      content_html: '<p>I support this update. We need clearer guest parking signs.</p>',
    },
    {
      discussion_id: parkingDiscussion.id,
      owner_user_id: ensuredTargetUsers[2].id,
      content_html: '<p>Can we also reserve one slot for deliveries after 18:00?</p>',
    },
    {
      discussion_id: intercomDiscussion.id,
      owner_user_id: ensuredTargetUsers[0].id,
      content_html: '<p>Option B looks best for reliability and mobile app support.</p>',
    },
    {
      discussion_id: intercomDiscussion.id,
      owner_user_id: ensuredTargetUsers[2].id,
      content_html: '<p>I agree. Please ask for warranty extension in the quote.</p>',
    },
  ];

  const { error: messagesInsertError } = await supabase.from('messages').insert(messagesSeed);
  if (messagesInsertError) throw messagesInsertError;

  console.log('Sample seed completed successfully.');
  console.log(`Users seeded/ensured: ${ensuredTargetUsers.length} target + ${auxOwners.length} auxiliary owners`);
  console.log(`Independent objects: ${independentObjects.length} (6 owned by target users)`);
  console.log(`Obligations (2025): ${obligationsSeed.length}, payments marked paid: 3`);
  console.log(`Events: ${eventsSeed.length}, discussions: ${discussionsSeed.length}, messages: ${messagesSeed.length}`);
  console.log(`All seeded user IDs: ${allSeedUserIds.join(', ')}`);
}

run().catch((error) => {
  console.error('Seed failed:', error.message);
  process.exitCode = 1;
});
