-- Map positions for the 21 official safe points (supplied list, 7 Nov 2026).
--
-- Coordinates were read off a map by the project team on 13 Nov 2026 and are
-- approximate (building entrance or centre, to within a few tens of metres).
-- Security staff can move any point on the dashboard (Safe points page); this
-- migration only fills points that have no position yet, so it never
-- overwrites a pin set by staff.

with pins (name, lat, lng) as (
  values
  ('24-Hour Reading Foyer (PHS & PHS 1)',                   5.358776, 100.302848),
  ('Balai Polis Gelugor',                                   5.356512, 100.295599),
  ('Chancellory II & USM General Operator',                 5.358454, 100.304968),
  ('Desasiswa Aman Damai Fajar Harapan (ADFH)',             5.355082, 100.297059),
  ('Desasiswa Bakti Permai, Fajar & Petas (BFPP)',          5.359548, 100.301682),
  ('Desasiswa Cahaya Gemilang Harapan (CGH)',               5.361304, 100.302759),
  ('Desasiswa Indah Kembara (IK)',                          5.355044, 100.294243),
  ('Desasiswa Tekun',                                       5.355259, 100.291231),
  ('Desasiswa Restu',                                       5.355315, 100.289377),
  ('Desasiswa Saujana',                                     5.355995, 100.289787),
  ('Pintu Kawalan RST (RST Security Gate)',                 5.355439, 100.292554),
  ('Pintu Kawalan Stadium (Stadium Security Gate)',         5.355399, 100.293441),
  ('Pintu Kawalan Minden (Minden Security Gate)',           5.356513, 100.305177),
  ('Unit Kecemasan & Ambulans, Pusat Sejahtera',            5.358925, 100.302641),
  ('Jabatan Keselamatan HQ (Main Security Command)',        5.355382, 100.297339),
  ('Pusat Sukan dan Rekreasi (Sports Complex)',             5.355562, 100.302992),
  ('Perpustakaan Hamzah Sendut 1 (PHS 1 Main Building)',    5.357233, 100.303408),
  ('Pintu Kawalan Batu Uban (Batu Uban Security Gate)',     5.354508, 100.305511),
  ('Masjid Al-Malik Khalid (Pusat Islam USM)',              5.354146, 100.302295),
  ('Pintu Kawalan Sungai Dua (Sungai Dua Security Gate)',   5.353563, 100.302684),
  ('Balai Polis Sungai Nibong',                             5.335544, 100.297109)
)
update public.safe_point sp
   set location = extensions.st_setsrid(extensions.st_makepoint(pins.lng, pins.lat), 4326)::extensions.geography
  from pins
 where sp.name = pins.name
   and sp.location is null;
