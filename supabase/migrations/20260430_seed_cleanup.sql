update merchants
   set name = 'Nebula Commerce',
       slug = 'nebula-commerce',
       updated_at = now()
 where id = 'mrc_demo';

update users
   set full_name = 'Nebula Commerce Owner'
 where email = 'owner@nebula.dev';

delete from platform_treasury_wallets
 where wallet_address like 'PLATFORM\_%' escape '\';
