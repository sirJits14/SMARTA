import S from '../../strings.js';
import PageHeader from '../../components/PageHeader.jsx';
import villaPhoto from '../../assets/developers/geths-van-c-villa.jpg';
import candanoPhoto from '../../assets/developers/emmanuel-candano.jpg';
import abellanaPhoto from '../../assets/developers/el-chamberlain-q-abellana.jpg';
import './DevelopersPage.css';

const DEVELOPERS = [
  { name: S.developerVillaName, position: S.developerVillaPosition, role: S.developerVillaRole, photo: villaPhoto },
  { name: S.developerCandanoName, position: S.developerCandanoPosition, role: S.developerCandanoRole, photo: candanoPhoto },
  { name: S.developerAbellanaName, position: S.developerAbellanaPosition, role: S.developerAbellanaRole, photo: abellanaPhoto },
];

export default function DevelopersPage({ back }) {
  return (
    <>
      <PageHeader title={S.settingsDevelopers} onBack={back} />
      <div className="developers-list">
        {DEVELOPERS.map(({ name, position, role, photo }, index) => (
          <figure className="glass-card settings-group developers-person" key={name}>
            <img className="developers-portrait" src={photo} alt={name} width="360" height="450"
              loading={index === 0 ? 'eager' : 'lazy'} decoding="async" />
            <figcaption className="developers-caption">
              <h2 className="developers-name">{name}</h2>
              <p className="developers-position">{position}</p>
              <p className="developers-role">{role}</p>
            </figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}
