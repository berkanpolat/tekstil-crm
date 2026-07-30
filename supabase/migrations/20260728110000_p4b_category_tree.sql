-- =====================================================================
-- G — Kategori ağacı yeniden. Üst kategori = "Ana Grup / Dal" (2 seviye şemaya uyar,
-- operasyon modelini kırmaz), altında kapsamlı ürün türleri. Eski kategoriler PASİF
-- (is_active=false) — mevcut operasyon/talep kayıtları korunur (FK bozulmaz). Ayarlardan
-- yönetilir; listede olmayan tür sonradan eklenebilir (mevcut Kategori/Tür ekranı).
-- =====================================================================

-- 1) Eskiyi pasifle (veri korunur; sistem bayrağını da kaldır ki editörden yönetilebilsin)
update public.product_categories set is_active = false;

-- 2) Yeni ağaç — jsonb sürücülü kurulum
do $$
declare
  v_tree jsonb := $json$
  [
   {"g":"Kadın Giyim","d":"Üst Giyim","t":["Tişört","Body","Atlet","Polo Yaka","Gömlek","Bluz","Tunik","Kazak","Hırka","Sweatshirt","Hoodie","Büstiyer","Crop"]},
   {"g":"Kadın Giyim","d":"Alt Giyim","t":["Pantolon","Kot Pantolon","Chino","Şort","Etek","Tayt","Jogger","Eşofman Altı","Kapri"]},
   {"g":"Kadın Giyim","d":"Dış Giyim","t":["Ceket","Blazer","Mont","Kaban","Trençkot","Yağmurluk","Yelek","Kimono"]},
   {"g":"Kadın Giyim","d":"Elbise/Takım","t":["Elbise","Abiye","Tulum","İkili Takım","Jile Takım"]},
   {"g":"Kadın Giyim","d":"İç Giyim/Ev Giyimi","t":["İç Çamaşırı","Sütyen","Külot","Çorap","Pijama Takımı","Gecelik","Sabahlık","Bornoz"]},
   {"g":"Kadın Giyim","d":"Spor Giyim","t":["Spor Tayt","Spor Sütyeni","Spor Tişört","Eşofman Takımı","Spor Şort"]},
   {"g":"Kadın Giyim","d":"Tesettür","t":["Tesettür Elbise","Ferace","Abaya","Tesettür Tunik","Şal","Bone","Eşarp","Pardösü"]},
   {"g":"Kadın Giyim","d":"Aksesuar","t":["Şapka","Bere","Atkı","Eldiven","Şal/Fular","Çanta"]},

   {"g":"Erkek Giyim","d":"Üst Giyim","t":["Tişört","Polo Yaka","Gömlek","Kazak","Hırka","Sweatshirt","Hoodie","Atlet"]},
   {"g":"Erkek Giyim","d":"Alt Giyim","t":["Pantolon","Kot Pantolon","Chino","Şort","Jogger","Eşofman Altı"]},
   {"g":"Erkek Giyim","d":"Dış Giyim","t":["Ceket","Blazer","Mont","Kaban","Trençkot","Yağmurluk","Yelek"]},
   {"g":"Erkek Giyim","d":"Elbise/Takım","t":["Takım Elbise","Smokin"]},
   {"g":"Erkek Giyim","d":"İç Giyim/Ev Giyimi","t":["Boxer","Slip","Atlet","Çorap","Pijama Takımı","Bornoz"]},
   {"g":"Erkek Giyim","d":"Spor Giyim","t":["Spor Tişört","Spor Şort","Eşofman Takımı","Forma"]},
   {"g":"Erkek Giyim","d":"Aksesuar","t":["Şapka","Bere","Atkı","Eldiven","Kravat","Papyon"]},

   {"g":"Çocuk/Bebek Giyim","d":"Üst Giyim","t":["Tişört","Body","Zıbın","Badi","Sweatshirt","Hoodie","Gömlek","Kazak","Hırka"]},
   {"g":"Çocuk/Bebek Giyim","d":"Alt Giyim","t":["Pantolon","Şort","Etek","Tayt","Eşofman Altı","Jogger"]},
   {"g":"Çocuk/Bebek Giyim","d":"Dış Giyim","t":["Mont","Kaban","Yağmurluk","Yelek","Ceket"]},
   {"g":"Çocuk/Bebek Giyim","d":"Elbise/Takım","t":["Elbise","Tulum","İkili Takım","Zıbın Takımı"]},
   {"g":"Çocuk/Bebek Giyim","d":"İç Giyim/Ev Giyimi","t":["İç Çamaşırı","Çorap","Pijama Takımı","Patik","Önlük"]},
   {"g":"Çocuk/Bebek Giyim","d":"Spor Giyim","t":["Eşofman Takımı","Spor Tişört","Spor Şort"]},
   {"g":"Çocuk/Bebek Giyim","d":"Aksesuar","t":["Şapka","Bere","Atkı","Eldiven","Patik"]},

   {"g":"Unisex Giyim","d":"Üst Giyim","t":["Tişört","Sweatshirt","Hoodie","Polo Yaka","Kazak","Atlet"]},
   {"g":"Unisex Giyim","d":"Alt Giyim","t":["Jogger","Eşofman Altı","Şort","Pantolon"]},
   {"g":"Unisex Giyim","d":"Dış Giyim","t":["Mont","Yelek","Ceket","Yağmurluk"]},
   {"g":"Unisex Giyim","d":"Spor Giyim","t":["Eşofman Takımı","Spor Tişört","Spor Şort"]},
   {"g":"Unisex Giyim","d":"Aksesuar","t":["Şapka","Bere","Atkı","Eldiven","Çanta"]},

   {"g":"Kurumsal/Promosyon","d":"İş Giyimi","t":["İş Önlüğü","Forma","Aşçı Ceketi","İş Tulumu","Yelek Yaka","İş Gömleği","İş Pantolonu","Reflektörlü Yelek"]},
   {"g":"Kurumsal/Promosyon","d":"Promosyon Ürünleri","t":["Promosyon Tişört","Promosyon Şapka","Promosyon Çanta","Polo Yaka","Sweatshirt","Yelek","Önlük"]},
   {"g":"Kurumsal/Promosyon","d":"Aksesuar","t":["Şapka","Bere","Atkı","Eldiven","Çanta"]}
  ]
  $json$;
  rec jsonb; tur text; v_parent bigint; v_gsort int := 0; v_tsort int;
  v_gkey text; v_tkey text;
begin
  for rec in select * from jsonb_array_elements(v_tree) loop
    v_gsort := v_gsort + 10;
    v_gkey := 'g_' || public.normalize_tr(rec->>'g') || '_' || public.normalize_tr(rec->>'d');
    v_gkey := regexp_replace(v_gkey, '[^a-z0-9]+', '_', 'g');
    insert into public.product_categories (key, label, parent_id, sort_order, is_active, is_system)
    values (v_gkey, (rec->>'g') || ' / ' || (rec->>'d'), null, v_gsort, true, false)
    on conflict (key) do update set label = excluded.label, parent_id = null, is_active = true, sort_order = excluded.sort_order
    returning id into v_parent;

    v_tsort := 0;
    for tur in select * from jsonb_array_elements_text(rec->'t') loop
      v_tsort := v_tsort + 10;
      v_tkey := v_gkey || '_' || regexp_replace(public.normalize_tr(tur), '[^a-z0-9]+', '_', 'g');
      insert into public.product_categories (key, label, parent_id, sort_order, is_active, is_system)
      values (v_tkey, tur, v_parent, v_tsort, true, false)
      on conflict (key) do update set label = excluded.label, parent_id = v_parent, is_active = true, sort_order = excluded.sort_order;
    end loop;
  end loop;
end $$;
