-- Default income heads for organisations that already exist (new ones get them from the seed).
-- PROVISIONAL revenue codes: the Super Admin must verify them; they are editable until first used.
INSERT INTO "LedgerAccount" (id, "orgId", kind, code, "activityNo", "nameNe", "nameEn", source, "sortOrder")
SELECT gen_random_uuid(), o.id, 'REVENUE', h.code, '', h.ne, h.en, h.src::"FundSource", h.ord
FROM "Organization" o
CROSS JOIN (VALUES
  ('14211', 'प्रवेश/टिकट शुल्क', 'Entry / ticket fee', 'INTERNAL', 101),
  ('14213', 'होटल, लज तथा पसल भाडा', 'Hotel, lodge & shop rent', 'INTERNAL', 102),
  ('14212', 'सेवा शुल्क', 'Service fee', 'INTERNAL', 103),
  ('14229', 'पार्किङ शुल्क', 'Parking fee', 'INTERNAL', 104),
  ('14311', 'दान, भेटी तथा चढावा', 'Donations & offerings', 'INTERNAL', 105),
  ('14111', 'बैंक ब्याज', 'Bank interest', 'INTERNAL', 106),
  ('14529', 'विविध आम्दानी', 'Miscellaneous income', 'INTERNAL', 107),
  ('13311', 'संघीय सरकार अनुदान', 'Federal government grant', 'GRANT', 111),
  ('13312', 'प्रदेश सरकार अनुदान', 'Provincial government grant', 'GRANT', 112),
  ('13313', 'स्थानीय तह अनुदान', 'Local government grant', 'GRANT', 113),
  ('13314', 'अन्य संस्था/दातृ निकाय अनुदान', 'Other agency / donor grant', 'GRANT', 114)
) AS h(code, ne, en, src, ord)
ON CONFLICT DO NOTHING;
