-- Site-level settings used by the public homepage and contact page.
alter table settings
  add column if not exists contact_whatsapp text,          -- international format, e.g. +447700900000
  add column if not exists contact_email text,
  add column if not exists address_line text not null default 'Upstairs The Heathcote and Star, 344 Grove Green Road, E11 4EA',
  add column if not exists promo_text text default 'Interested to join Yoga in the Stars? Our Memberships are Pay as You Wish, plus first 2 months half-price! Unlimited sessions / £39/mo (less than £9/week). Use discount code HALFPRICEYOGA.',
  add column if not exists promo_url text default '/membership',
  add column if not exists instagram_url text default 'https://www.instagram.com/yoga_in_the_stars/',
  add column if not exists facebook_url text default 'https://www.facebook.com/yogainthestars',
  add column if not exists youtube_url text default 'https://www.youtube.com/channel/UCanX0-nhScSp0C1XdEgs9hg';
