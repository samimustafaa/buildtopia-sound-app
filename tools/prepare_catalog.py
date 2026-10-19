import sys, json, struct, hashlib, subprocess, collections
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT.parent/'analysis'))
from npk_audio import *

donor,bt=archive(ROOT.parent/'inputs/wwise(1).npk')
original,cd=archive(ROOT.parent/'inputs/wwise(2).npk')
bm,_=metadata(donor,bt);cm,_=metadata(original,cd)
bks=bankkeys(donor,bt);cks=bankkeys(original,cd);pcks=packages(donor,bt)
data=ROOT/'app/data';patchdir=data/'patches';patchdir.mkdir(exist_ok=True)
previews=ROOT/'app/assets/audio';previews.mkdir(parents=True,exist_ok=True)
tmp=ROOT.parent/'analysis/audio';tmp.mkdir(exist_ok=True)
names={
'weapon_ak47':('AK-47','Rifles','ak47'), 'weapon_scar':('SCAR','Rifles','scar'),
'weapon_xm8':('XM8','Rifles','xm8'), 'weapon_tsg':('DTR','Shotguns','dtr'),
'weapon_pump':('M1915 / Pump','Shotguns','m1915'), 'weapon_sp':('SP shotgun','Shotguns','dtr'),
'weapon_tsmg':('UMP9','SMGs','ump9'), 'weapon_smg':('Uzi','SMGs','uzi'),
'weapon_awp':('AWP','Snipers','awp'), 'weapon_vss':('VSS','Snipers','vss'),
'weapon_vhs':('VHS','Rifles','xm8'), 'weapon_sasr':('SASR','Snipers','vss'),
'weapon_pistol':('92F / P229','Pistols','92f'), 'weapon_revolver':('Revolver','Pistols','p229'),
'weapon_gatlin':('M134','Special','m134'), 'weapon_m16':('M16','Rifles','ak47'),
'weapon_st40':('ST40','Rifles','xm8'), 'weapon_arch':('Bow','Special','vss'),
'weapon_flame':('Flamethrower','Special','m134'), 'weapon_plasma':('Plasma SMG','SMGs','ump9'),
'weapon_nail_gun':('Nail Gun','Special','ump9'), 'weapon_rocket':('Rocket Launcher','Special','awp'),
'weapon_rocket_tracing':('Tracking Rocket','Special','awp'), 'weapon_grenade':('Grenade Launcher','Special','dtr'),
'weapon_frag':('Frag Grenade','Special',''), 'weapon_bomb':('Bomb','Special',''),
'weapon_bowling':('Bowling Bomb','Special',''), 'weapon_we_broadsword':('Broadsword','Special',''),
'weapon_dcp':('DCP','Special',''), 'weapon_gzfsq':('GZFSQ','Special',''),
'weapon_konghe':('Konghe','Special',''), 'weapon_we':('WE','Special',''), 'weapon_we_motor':('WE Motor','Special',''),
'weapon_reload_plasma':('Plasma Reload','Special','ump9'), 'weapon':('Shell Drops','Effects',''),
'awp_reload':('AWP Reload','Effects','awp'), 'bullet':('Bullet Impacts','Effects',''),
'vehicle_karting':('Kart','Driving',''), 'vehicle_bumblebee':('Bumblebee','Driving',''),
'vehicle_new_car':('Car Engine','Driving',''), 'vehicle_car':('Vehicle Alarms','Driving',''),
'vehicle_all_use':('Vehicle Damage','Effects',''), 'vehicle_karting_skill':('Kart Boost & Shield','Driving',''),
'vehicle_zhanche':('Armored Vehicle','Driving',''), 'police_car':('Police Car','Driving',''),
'vehicle_aircraft':('Aircraft','Flying',''), 'parachute_3d':('Parachute 3D','Flying',''),
'parachute_fly_standalone':('Parachute Flying','Flying',''), 'vehicle_parachute':('Parachute Actions','Flying',''),
'vehicle_parachute_westwind_vo':('Westwind Parachute','Flying',''),
'trap':('Basic Traps','Basic',''), 'trap_turret':('Turret','Combat',''), 'trap_uav':('UAV','Combat',''),
'trap_heat_sensor':('Heat Sensor','Detection',''), 'trap_destruction_robot':('Destruction Robot','Combat',''),
'trap_dance':('Dance Trap','Special',''), 'trap_time_boom':('Timed Bomb','Combat',''),
'trap_magnetic_shield':('Magnetic Shield','Defense',''), 'trap_hzzdyq':('Radar / Alarm Trap','Detection',''),
'trap_tszy':('Spring Trap','Movement',''), 'trap_20010':('Trap 20010','Special',''),
'trap_jnzz':('JNZZ Trap','Special',''), 'trap_mnzz':('MNZZ Trap','Special',''), 'trap_qbzd':('QBZD Trap','Special','')}
confirmed={'weapon_ak47','weapon_scar','weapon_xm8','weapon_pump','weapon_smg','weapon_tsmg','weapon_tsg','weapon_awp','weapon_vss','weapon_vhs','weapon_pistol','weapon_revolver','weapon_gatlin','weapon_flame','weapon_plasma'}
priority=['weapon_ak47','weapon_scar','weapon_xm8','weapon_tsg','weapon_awp','weapon_tsmg','weapon_gatlin','weapon_pistol','weapon_pump','weapon_smg','weapon_vss','weapon_revolver','weapon_vhs']
catalog=[];patch_manifest={};all_previews=[]
for name in names:
    if name not in bm or name not in cm:continue
    info=bm[name];old=cm[name]
    if set(old['events'])-set(info['events']):continue
    banks=sorted(set(bks.get(info['id'],[]))&set(cks.get(info['id'],[])))
    if not banks or info['xml_key'] not in cd:continue
    required=info['streams']
    candidates=[(len(files),k) for k,files in pcks.items() if required and required<={mid for mid,l in files}]
    if required and not candidates:continue
    pkg=[k for size,k in candidates if size==min(s for s,k in candidates)] if candidates else []
    keys=sorted(set([*banks,info['xml_key'],*pkg]));assert all(k in cd for k in keys)
    mutable=[]
    for k in keys:
        d=payload(donor,bt,k)
        if d==payload(original,cd,k):continue
        key=f'{k:08x}';mutable.append(key)
        if key not in patch_manifest:
            (patchdir/(key+'.bin')).write_bytes(d)
            patch_manifest[key]={'entry':list(bt[k]),'sha256':hashlib.sha256(d).hexdigest()}
    audio_diff=any(payload(donor,bt,k)!=payload(original,cd,k) for k in [*banks,*pkg])
    title,category,art=names[name]
    section='vehicles' if name.startswith(('vehicle','parachute')) or name=='police_car' else 'traps' if name.startswith('trap') else 'weapons'
    entry={'id':name,'name':title,'category':category,'section':section,'art':art,'resources':mutable,'differentAudio':audio_diff,'tested':name in confirmed,'available':True,'preview':None,'note':''}
    if name=='weapon_pistol':entry['note']='92F and P229 use this shared pistol sound-bank selection. Their exact independent routing has not been verified.'
    elif name=='weapon_pump':entry['note']='Pump sound bank. Your feedback called this M1915; the source clips are labelled s1897.'
    elif name in ['weapon_dcp','weapon_gzfsq','weapon_konghe','weapon_we','weapon_we_motor','trap_jnzz','trap_mnzz','trap_qbzd','trap_20010']:entry['note']='Source-bank label; the exact in-game item name still needs confirmation.'
    files={mid:buf for k in pkg for (mid,lang),buf in pcks[k].items()}
    sample_names={int(f.attrib['Id']):f.findtext('ShortName') or '' for f in info['root'].findall('.//File') if f.findtext('ShortName')}
    if not files:
        for bank_key in banks:
            bank=payload(donor,bt,bank_key);parts={};offset=0
            while offset+8<=len(bank):
                tag=bank[offset:offset+4];size=struct.unpack_from('<I',bank,offset+4)[0];parts[tag]=bank[offset+8:offset+8+size];offset+=8+size
            if b'DIDX' in parts and b'DATA' in parts:
                for mid,start,length in struct.iter_unpack('<3I',parts[b'DIDX']):files[mid]=parts[b'DATA'][start:start+length]
    if files:
        ranked=sorted(files,key=lambda mid:(0 if 'p1_main01' in sample_names.get(mid,'') or 'shot_main01' in sample_names.get(mid,'') else 1 if 'main01' in sample_names.get(mid,'') else 2 if '01' in sample_names.get(mid,'') else 3,mid))
        if ranked:all_previews.append((entry,files[ranked[0]],sample_names.get(ranked[0],'')))
    catalog.append(entry)

catalog.sort(key=lambda e:(['weapons','vehicles','traps'].index(e['section']),priority.index(e['id']) if e['id'] in priority else 100,e['name']))
catalog.append({'id':'weapon_m82a3','name':'M82A3','category':'Snipers','section':'weapons','art':'awp','resources':[],'differentAudio':False,'tested':False,'available':False,'preview':None,'note':'No corresponding M82A3 bank exists in the supplied BuildTopia archive.'})
for entry,buf,name in all_previews:
    wem=tmp/(entry['id']+'.wem');wav=tmp/(entry['id']+'.wav');ogg=previews/(entry['id']+'.ogg')
    wem.write_bytes(buf)
    cmd=[str(ROOT.parent/'analysis/vgmstream/vgmstream-cli'),'-i','-o',str(wav),str(wem)]
    r=subprocess.run(cmd,capture_output=True)
    if r.returncode==0:
        r=subprocess.run(['ffmpeg','-v','error','-y','-i',str(wav),'-t','5','-c:a','libvorbis','-q:a','3',str(ogg)],capture_output=True)
        if r.returncode==0:entry['preview']='assets/audio/'+ogg.name
    if entry['preview'] is None:print('No preview',entry['id'])

# Explicit linked groups if independently named cards require the same mutable resource.
for item in catalog:
    item['linked']=[other['id'] for other in catalog if other['id']!=item['id'] and set(item['resources'])&set(other['resources'])]
    if item['linked']:print('LINKED',item['id'],item['linked'])
manifest={'version':1,'originalSha256':hashlib.sha256(original).hexdigest(),'originalSize':len(original),'originalCount':len(cd),'knownArchiveHashes':[hashlib.sha256(original).hexdigest(),'526b3e4e56e18900e50161696005408a1a2c7543f2d536936b9794207b2fa4b0','4710487c539d0492eb5fa350e1f3712f409be78a1b537ad7b2fae11293ebcc54','63639978b1d64e68b9ef2b43630d47fcdbd2ba044677920cebe8b53bfde119a6','b00af73ee7293726c4e9c22893ba092d92370c0d0b6f23019af18803b3b50881','ae300c5aab6bd0134cd96cf20ae5b96f1613182e26dce7c3825406dcf706c894'],'patches':patch_manifest}
(data/'manifest.json').write_text(json.dumps(manifest,indent=2))
(data/'catalog.json').write_text(json.dumps(catalog,indent=2))
print('Catalog',len(catalog),'patches',len(patch_manifest),'previews',sum(bool(x['preview']) for x in catalog),'patch bytes',sum((patchdir/(k+'.bin')).stat().st_size for k in patch_manifest))
