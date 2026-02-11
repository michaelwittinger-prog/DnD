interface Entity {
  id: string;
  name: string;
  type: 'player' | 'npc';
  role: 'pc' | 'enemy' | 'ally' | 'neutral';
  hp: { current: number; max: number };
  conditions: string[];
}

interface Session {
  id: string;
  system: string;
  language: 'de' | 'en';
  scene_id: string;
  round: number;
  turn_index: number;
  active_entity_id: string;
  phase: 'setup' | 'exploration' | 'combat';
}

interface InfoPanelProps {
  session: Session;
  entities: Entity[];
}

export function InfoPanel({ session, entities }: InfoPanelProps) {
  const activeEntity = entities.find((e) => e.id === session.active_entity_id);

  return (
    <div style={panelStyle}>
      <h2 style={titleStyle}>Session Info</h2>

      <div style={sectionStyle}>
        <div style={labelStyle}>Phase</div>
        <div style={valueStyle}>{session.phase.toUpperCase()}</div>
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>Round</div>
        <div style={valueStyle}>{session.round}</div>
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>Active Entity</div>
        <div style={valueHighlightStyle}>
          {activeEntity ? activeEntity.name : session.active_entity_id}
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>Turn Index</div>
        <div style={valueStyle}>{session.turn_index}</div>
      </div>

      <hr style={dividerStyle} />

      <h3 style={subtitleStyle}>Entities</h3>
      {entities.map((entity) => (
        <div
          key={entity.id}
          style={{
            ...entityRowStyle,
            borderLeft:
              entity.id === session.active_entity_id
                ? '3px solid #ffdd44'
                : '3px solid transparent',
          }}
        >
          <div style={entityNameStyle}>
            {entity.name}
            <span style={roleTagStyle(entity.role)}>{entity.role}</span>
          </div>
          <div style={hpStyle}>
            HP: {entity.hp.current}/{entity.hp.max}
          </div>
          {entity.conditions.length > 0 && (
            <div style={conditionStyle}>
              {entity.conditions.map((c) => (
                <span key={c} style={conditionTagStyle}>
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}

      <hr style={dividerStyle} />

      <div style={footerStyle}>
        Scene: {session.scene_id} | System: {session.system}
      </div>
    </div>
  );
}

// Inline styles
const panelStyle: React.CSSProperties = {
  backgroundColor: '#1e1e2e',
  color: '#ccccdd',
  padding: '16px',
  borderRadius: '8px',
  border: '1px solid #333',
  width: '260px',
  fontFamily: 'sans-serif',
  fontSize: '13px',
};

const titleStyle: React.CSSProperties = {
  margin: '0 0 12px 0',
  fontSize: '16px',
  color: '#ffffff',
};

const subtitleStyle: React.CSSProperties = {
  margin: '8px 0',
  fontSize: '14px',
  color: '#ffffff',
};

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: '6px',
};

const labelStyle: React.CSSProperties = {
  color: '#888899',
};

const valueStyle: React.CSSProperties = {
  color: '#ddddee',
  fontWeight: 'bold',
};

const valueHighlightStyle: React.CSSProperties = {
  color: '#ffdd44',
  fontWeight: 'bold',
};

const dividerStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid #333',
  margin: '12px 0',
};

const entityRowStyle: React.CSSProperties = {
  padding: '6px 8px',
  marginBottom: '4px',
  backgroundColor: '#252538',
  borderRadius: '4px',
};

const entityNameStyle: React.CSSProperties = {
  fontWeight: 'bold',
  color: '#ddddee',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const roleTagStyle = (role: string): React.CSSProperties => ({
  fontSize: '10px',
  padding: '1px 6px',
  borderRadius: '3px',
  backgroundColor:
    role === 'pc' ? '#2266aa' : role === 'enemy' ? '#aa3333' : role === 'ally' ? '#228833' : '#555',
  color: '#fff',
});

const hpStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#aaaabb',
  marginTop: '2px',
};

const conditionStyle: React.CSSProperties = {
  marginTop: '3px',
};

const conditionTagStyle: React.CSSProperties = {
  fontSize: '10px',
  padding: '1px 5px',
  borderRadius: '3px',
  backgroundColor: '#aa6622',
  color: '#fff',
  marginRight: '4px',
};

const footerStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#666677',
};
