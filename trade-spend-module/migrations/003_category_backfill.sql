-- Trade Spend Native Module — 003: populate category + brand on dash_sku_master
-- Source of truth: the Dashboard's operational sales dataset (per-SKU category),
-- independently cross-validated against Trade Spend history (19/20 exact
-- agreement, zero disagreements; the one gap is a Cyrillic-C spelling variant).
-- All items are Roshen brand.
with m(description, category) as (values
  ('Roshan Chocolate True Dark Special 56% 35X85G', 'Dark Chocolate'),
  ('Roshen  Butter-Milk Hard Candies 8 X 1Kg', 'Bulk 16 SR'),
  ('Roshen  Wafers Choco, Wafers 22 X 72G', 'Wafer 72 Gram'),
  ('Roshen  Wafers Hazelnut Wafers 22 X 72G', 'Wafer 72 Gram'),
  ('Roshen  Wafers Milk Wafers 22 X 72G', 'Wafer 72 Gram'),
  ('Roshen Aerated Dark Chocolate 20X80G', 'Aerated Chocolate'),
  ('Roshen Aerated Milk Chocolate 20X80G', 'Aerated Chocolate'),
  ('Roshen Beri Hard Candy 8X1KG', 'Bulk 16 SR'),
  ('Roshen Bim-Bom Hard Candies With Fruit-Berry Filling 8 X 1Kg', 'Bulk 16 SR'),
  ('Roshen Bonny Fruit Berry Mix, Mixed Fruit Flavoured Jelly 18 X 200G', 'Bonny Fruit'),
  ('Roshen Bonny Fruit Citrus Mix, Mixed Fruit Flavoured Jelly 18 X 200G', 'Bonny Fruit'),
  ('Roshen Bonny Fruit Summer Mix, Mixed Fruit Flavoured Jelly 18 X 200G', 'Bonny Fruit'),
  ('Roshen Candies ?razy Bee Frutty 9 X 1Kg', 'Bulk 16 SR'),
  ('Roshen Candy Nut Nougat And Soft Caramel With Peanuts 5 X 1Kg', 'Bulk 22 SR'),
  ('Roshen Candy Nut With Soft Caramel And Peanuts 8 X 1Kg', 'Bulk 22 SR'),
  ('Roshen Chocolate Dark Bitter 80% 35X85G', 'Dark Chocolate'),
  ('Roshen Chocolate Dark Brut 80% 35X85G', 'Dark Chocolate'),
  ('Roshen Chocolate Dark with Salted Almonds 35X85G', 'Dark Chocolate'),
  ('Roshen Citrus Mix Hard Candy 7X1KG', 'Bulk 16 SR'),
  ('Roshen Cracker 2 Crack with Cocoa-Hazelnut Filling  26 X 190g', '2 Crack'),
  ('Roshen Cracker 2 Crack with Milk-Vanila Filling  26 X 190g', '2 Crack'),
  ('Roshen Filled Hard Candies Peppinezzz 6 X 900G', 'Bulk 16 SR'),
  ('Roshen Fizzy H/Candy (8% fizzy filling) Orange, Lime, Cola Flavors 7 X 1kg', 'Bulk 16 SR'),
  ('Roshen Fudgenta 16X400G', 'Fudgenta 400 G'),
  ('Roshen Hard Candies  Lollipops With Yoghurt Flavours 9 X 920G', 'Lollipops'),
  ('Roshen Hard Candies Bim-Bom 11 X 200G', 'Sweet Packet'),
  ('Roshen Hard Candies Coffeelike 7 X 1Kg', 'Bulk 16 SR'),
  ('Roshen Hard Candies Lollipops with Cocktail Flavours 9X920G', 'Lollipops'),
  ('Roshen Hard Candies Sweet Drop 12 X 150G', 'Sweet Packet'),
  ('Roshen Hard Candies Sweet Drop 7 X 1Kg', 'Bulk 16 SR'),
  ('Roshen Hola Granola Bar 8X500G', 'Granola'),
  ('Roshen Jelly Candies ?razy Bee Frutty 12 X 200G', 'Sweet Packet'),
  ('Roshen Jelly Candy 13X200G', 'Sweet Packet'),
  ('Roshen Jelly Mixed Fruit Flavoured Jelly Sweets 10 X 1Kg', 'Bulk 16 SR'),
  ('Roshen Johnny Krocker Choco Wafer 12X350G', 'Johnny Krocker 350 G'),
  ('Roshen Johnny Krocker Coconut Wafer with Coconut Cream in Chocolate 4 X 1kg', 'Johnny Krocker 1KG'),
  ('Roshen Johnny Krocker Milk Wafer 12X350G', 'Johnny Krocker 350 G'),
  ('Roshen Juice Mix Hard Candy 8X1KG', 'Bulk 16 SR'),
  ('Roshen Konafetto. Wafer Rolls With Cocoa Flavoured Cream 15 X 140G', 'Konafetto Roll'),
  ('Roshen Konafetto. Wafer Rolls With Hazelnut Flavoured Filling 15 X 140G', 'Konafetto Roll'),
  ('Roshen Korivka Milk Sweets 12X205G', 'Sweet Packet'),
  ('Roshen Krokc Sweets Peanut Paste(34%) Cocoa Coating (25%) 8X1KG', 'Bulk 22 SR'),
  ('Roshen Lollipops Fruit Mis Bubble Gum 10X192G', 'Lollipops'),
  ('Roshen Lollipops Gum Fruit Mix, Hard Candy With Bubble Gum 9 X 920G', 'Lollipops'),
  ('Roshen Lovita Blondie Brownie Biscuits with Cocoa  21 X 152g', 'Lovita'),
  ('Roshen Lovita Blondie Brownie Biscuits with Coconut  21 X 152g', 'Lovita'),
  ('Roshen Lovita Blondie Brownie Biscuits with Lemon  21 X 152g', 'Lovita'),
  ('Roshen Lovita Jelly Cookies With Cherry Jelly Filling  21 X 135g', 'Lovita'),
  ('Roshen Lovita Jelly Cookies With Straberry Jelly Filling  21 X 135g', 'Lovita'),
  ('Roshen Lovita Soft Cream Cookies Cocoa 18X127G', 'Lovita'),
  ('Roshen Lovita Soft Cream Cookies Cocoa, Biscuits With Cocoa Filling 18 X 127G', 'Lovita'),
  ('Roshen Lovita Soft Cream Cookies Hazelnut 18X127G', 'Lovita'),
  ('Roshen Lovita With Coating Drops 16 X 150G', 'Lovita'),
  ('Roshen Lovita With Cocoa And Coating Drops 16 X 150G', 'Lovita'),
  ('Roshen Milk Chocolate Bar with Peanut Filling 180X29G', 'Choclate Bar'),
  ('Roshen Milky Splash Toffee With Milk Filling 12 X 150G', 'Sweet Packet'),
  ('Roshen Milky Splash, Toffee With Milk Filling 5 X 1Kg', 'Bulk 22 SR'),
  ('Roshen Minky Binky Toffee With Jelly Filling 6 X 1Kg', 'Bulk 16 SR'),
  ('Roshen Minte X + Mint, Hard Candies With Mint Flavour 9 X 1Kg', 'Bulk 16 SR'),
  ('Roshen Peppinez Sour Filled Candy 10X180G', 'Bulk 16 SR'),
  ('Roshen Roshetto Dark Chocolate 200 X 34G', 'Roshetto'),
  ('Roshen Roshetto Milk Chocolate 200 X 34G', 'Roshetto'),
  ('Roshen Roshetto Peanut 200 X 34G', 'Roshetto'),
  ('Roshen Sweets Johnny Krocker Choco 4 X 1Kg', 'Johnny Krocker 1KG'),
  ('Roshen Sweets Johnny Krocker Milk 4 X 1Kg', 'Johnny Krocker 1KG'),
  ('Roshen Tea Biscuits Biscuits With Baked Milk Flavor 28 X 185G', 'Tea Biscuits'),
  ('Roshen Tea Biscuits Biscuits With Butter-Vanilla Flavor 28 X 185G', 'Tea Biscuits'),
  ('Roshen Toffelini Toffee 6X1KG', 'Bulk 22 SR'),
  ('Roshen Wafer Sweets Konafetto Blanc 5 X 1Kg', 'Konafetto 1 KG'),
  ('Roshen Wafer Sweets Konafetto Nero 5 X 1Kg', 'Konafetto 1 KG'),
  ('Roshen Wafers Choco Family Pack 16X216G', 'Wafer 216 Gram'),
  ('Roshen Wafers Hazelnut Family Pack 16X216G', 'Wafer 216 Gram'),
  ('Roshen Wafers Milk Family Pack 16X216G', 'Wafer 216 Gram'),
  ('Roshen Yougrtini Hard Candy S/berry Cherry Peach 8X1KG', 'Bulk 16 SR')
)
update public.dash_sku_master d
set category = m.category, brand = 'Roshen'
from m
where lower(trim(d.description)) = lower(trim(m.description));

-- Cyrillic-C variant seen in Trade Spend history ("Сrazy Bee"); its dataset
-- siblings map to Sweet Packet. Cover any master row spelled either way.
update public.dash_sku_master
set category = 'Sweet Packet', brand = 'Roshen'
where category is null
  and lower(description) like '%razy bee%'
  and lower(description) like '%200g%';
