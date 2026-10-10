-- Run this after 001, 002, and 003.
-- Adds one shop, the stylists, and the service menu only when those tables are empty.
-- New rows get database ids. Bills stay empty until you save them from the counter.

insert into shops (name, address, phone, email, logo)
select 'Peeple Tree', 'Chandanagar, beside Union Bank', '888888888', 'peeple@gmail.com', 'logo.png'
where not exists (select 1 from shops);

insert into staff (name, commission_percent, active)
select seed.name, seed.commission_percent, seed.active
from (
  values
    ('Anita', 12::numeric, true),
    ('Ravi', 10::numeric, true),
    ('Lata', 8::numeric, true),
    ('Kiran', 15::numeric, false)
) as seed(name, commission_percent, active)
where not exists (
  select 1 from staff existing where existing.name = seed.name
);

insert into services (name, category, price, minutes, active, color)
select seed.name, seed.category, seed.price, seed.minutes, seed.active, seed.color
from (
  values
    ('Hair Cut', 'hair'::service_category, 150::numeric, 20, true, 'black'),
    ('Hair Cut + Beard', 'hair'::service_category, 250::numeric, 30, true, 'orange'),
    ('Hair Color', 'hair'::service_category, 200::numeric, 45, true, 'green'),
    ('Detan', 'skin'::service_category, 800::numeric, 30, true, 'red'),
    ('Gold Facial', 'skin'::service_category, 500::numeric, 40, true, 'pink'),
    ('Hair Wash', 'hair'::service_category, 1500::numeric, 20, true, 'green'),
    ('Men: Advance Haircut, Shave, Loreal Wash, De-Tan', 'special'::service_category, 699::numeric, 60, true, 'black'),
    ('Men: Hair Cut, Wash, Shave, Normal Facial', 'special'::service_category, 999::numeric, 75, true, 'orange'),
    ('Men: Hair Cut, Shave, Ammonia Free Colour, Facial', 'special'::service_category, 1599::numeric, 90, true, 'green'),
    ('Men: Hair Cut, Shave, Gold Facial, Hairspa, Pedicure', 'special'::service_category, 2499::numeric, 120, true, 'pink'),
    ('Waxing: Half Legs, Full Arms, Under Arms, Threading', 'special'::service_category, 499::numeric, 45, true, 'pink'),
    ('Rica Wax: Half Legs, Full Arms, Under Arms', 'special'::service_category, 749::numeric, 45, true, 'red'),
    ('Fruit Facial', 'special'::service_category, 799::numeric, 40, true, 'orange'),
    ('Papaya Facial', 'special'::service_category, 799::numeric, 40, true, 'orange'),
    ('Wine Facial', 'special'::service_category, 799::numeric, 40, true, 'red'),
    ('Whitening Facial', 'special'::service_category, 799::numeric, 40, true, 'pink'),
    ('Gold Facial', 'special'::service_category, 1199::numeric, 50, true, 'pink'),
    ('Pearl Facial', 'special'::service_category, 1199::numeric, 50, true, 'pink'),
    ('Silver Facial', 'special'::service_category, 1199::numeric, 50, true, 'black'),
    ('Tan Clear Facial', 'special'::service_category, 1199::numeric, 50, true, 'green'),
    ('Any Advanced Hair Cut', 'special'::service_category, 699::numeric, 40, true, 'black'),
    ('Women: Pedicure, Manicure, Facial, Threading', 'special'::service_category, 999::numeric, 90, true, 'pink')
) as seed(name, category, price, minutes, active, color)
where not exists (
  select 1
  from services existing
  where existing.name = seed.name
    and existing.category = seed.category
);
