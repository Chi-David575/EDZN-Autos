-- Optional: sample listings with photos so the app looks great on first launch.
-- Run once against your database: psql "$DATABASE_URL" -f db/seed.sql

insert into mechanics (name, phone, location, specialties, cars_serviced, price_range, bio, rating, verified, photo) values
('Tunde Balogun','0803 000 1111','Ikeja, Lagos','{Engine,Electrical}','{Toyota,Honda,Lexus}','₦8,000–₦40,000','12 years fixing engines and wiring faults across Lagos mainland.',4.8,true,'https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&w=500&q=80'),
('Chika Eze','0805 222 3344','Lekki, Lagos','{"AC / Cooling",Suspension}','{Kia,Hyundai,Nissan}','₦5,000–₦30,000','AC regas, radiators and suspension specialist.',4.6,true,'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=500&q=80'),
('Musa Ibrahim','0706 555 9090','Surulere, Lagos','{Brakes,Transmission}','{Toyota,Mercedes-Benz,Ford}','₦10,000–₦60,000','Gearbox rebuilds and brake systems, mobile service available.',4.9,true,'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=500&q=80'),
('Blessing Okon','0812 777 4455','Ajah, Lagos','{Diagnostics,Electrical}','{"All makes"}','₦6,000–₦25,000','OBD diagnostics and full electrical fault tracing.',4.7,false,'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=500&q=80');

insert into parts_sellers (shop_name, phone, shop_location, house_location, categories, photo) values
('Ladipo Auto Parts Hub','0803 111 2233','Ladipo Market, Mushin','Isolo, Lagos','{"Engine parts","Body parts"}','https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=500&q=80'),
('Berger Parts World','0807 444 8899','Berger, Lagos','Ojodu, Lagos','{Electrical,Filters}','https://images.unsplash.com/photo-1580273916550-e323be2ae537?auto=format&fit=crop&w=500&q=80');

insert into dispatch_riders (name, phone, vehicle, location, rating, status, photo) values
('Emeka Rider','0701 222 5566','Bike','Yaba, Lagos',4.7,'available','https://images.unsplash.com/photo-1557862921-37829c690f19?auto=format&fit=crop&w=500&q=80'),
('Fatima Sule','0902 333 7788','Van','Apapa, Lagos',4.5,'available','https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=500&q=80'),
('Godwin Peters','0813 999 2211','Bike','Ikorodu, Lagos',4.8,'available','https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=500&q=80');

insert into parts (seller_id, name, category, price, stock, photo)
select id, 'Brake Pad Set (Front)', 'Brakes', 14500, 22, 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=500&q=80' from parts_sellers where shop_name='Ladipo Auto Parts Hub';
insert into parts (seller_id, name, category, price, stock, photo)
select id, '12V Car Battery 60Ah', 'Electrical', 52000, 9, 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=500&q=80' from parts_sellers where shop_name='Berger Parts World';
insert into parts (seller_id, name, category, price, stock, photo)
select id, 'Alternator (Universal)', 'Engine parts', 38000, 6, 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=500&q=80' from parts_sellers where shop_name='Ladipo Auto Parts Hub';
insert into parts (seller_id, name, category, price, stock, photo)
select id, 'Headlight Assembly', 'Body parts', 21000, 11, 'https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&w=500&q=80' from parts_sellers where shop_name='Ladipo Auto Parts Hub';
insert into parts (seller_id, name, category, price, stock, photo)
select id, 'Spark Plug (set of 4)', 'Engine parts', 9000, 30, 'https://images.unsplash.com/photo-1580273916550-e323be2ae537?auto=format&fit=crop&w=500&q=80' from parts_sellers where shop_name='Berger Parts World';
insert into parts (seller_id, name, category, price, stock, photo)
select id, 'Radiator', 'Cooling', 29500, 8, 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=500&q=80' from parts_sellers where shop_name='Ladipo Auto Parts Hub';
insert into parts (seller_id, name, category, price, stock, photo)
select id, 'Wiper Blades (pair)', 'Body parts', 6500, 40, 'https://images.unsplash.com/photo-1580273916550-e323be2ae537?auto=format&fit=crop&w=500&q=80' from parts_sellers where shop_name='Berger Parts World';
insert into parts (seller_id, name, category, price, stock, photo)
select id, 'Side Mirror', 'Body parts', 12000, 14, 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=500&q=80' from parts_sellers where shop_name='Ladipo Auto Parts Hub';

insert into oil_products (name, price, stock, photo) values
('Fully Synthetic 5W-30 (4L)', 22000, 25, 'https://images.unsplash.com/photo-1613843516091-2351dd80d94f?auto=format&fit=crop&w=500&q=80'),
('Mineral Engine Oil 20W-50 (4L)', 11500, 40, 'https://images.unsplash.com/photo-1613843516091-2351dd80d94f?auto=format&fit=crop&w=500&q=80'),
('Gear Oil 90 (1L)', 4800, 33, 'https://images.unsplash.com/photo-1613843516091-2351dd80d94f?auto=format&fit=crop&w=500&q=80'),
('Brake Fluid DOT 4 (500ml)', 3200, 50, 'https://images.unsplash.com/photo-1613843516091-2351dd80d94f?auto=format&fit=crop&w=500&q=80'),
('Coolant / Antifreeze (1L)', 5200, 28, 'https://images.unsplash.com/photo-1613843516091-2351dd80d94f?auto=format&fit=crop&w=500&q=80');

insert into rentals (car, price_per_day, seats, status, photo) values
('Toyota Corolla 2019', 25000, 5, 'available', 'https://images.unsplash.com/photo-1623869675781-80aa31012948?auto=format&fit=crop&w=500&q=80'),
('Honda Accord 2020', 30000, 5, 'available', 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=500&q=80'),
('Toyota Sienna 2018', 35000, 7, 'available', 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=500&q=80'),
('Toyota Hilux 2021', 45000, 5, 'available', 'https://images.unsplash.com/photo-1553440569-bcc63803a83d?auto=format&fit=crop&w=500&q=80');