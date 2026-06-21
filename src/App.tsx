import {
  Bell,
  CalendarClock,
  Download,
  FileUp,
  Filter,
  Link2,
  Lock,
  Network,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Unlock,
  UserRoundPlus,
  Users,
  X,
} from "lucide-react";
import {
  ChangeEvent,
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Importance = 1 | 2 | 3 | 4 | 5;
type FollowStatus = "待跟进" | "已联系" | "观察中" | "暂停";

type Person = {
  id: string;
  name: string;
  color: string;
  tags: string[];
  contact: string;
  organization: string;
  location: string;
  note: string;
  importance: Importance;
  lastContactAt: string;
  nextFollowUpAt: string;
  followStatus: FollowStatus;
  warmth: number;
  createdAt: string;
  updatedAt: string;
};

type Relationship = {
  id: string;
  fromId: string;
  toId: string;
  type: string;
  directed: boolean;
  strength: number;
  status: string;
  startDate: string;
  endDate: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

type Interaction = {
  id: string;
  personId: string;
  date: string;
  method: string;
  topic: string;
  result: string;
  nextStep: string;
  createdAt: string;
};

type GraphPosition = {
  x: number;
  y: number;
};

type ModalMode = "person" | "relationship" | "path" | "analysis" | "followups" | "interaction" | null;

type PersistedState = {
  version: 2;
  exportedAt?: string;
  people: Person[];
  relationships: Relationship[];
  interactions: Interaction[];
  positions: Record<string, GraphPosition>;
};

const STORAGE_KEY = "relationship-manager-state-v2";
const LEGACY_STORAGE_KEY = "relationship-manager-state-v1";
const GRAPH_WIDTH = 900;
const GRAPH_HEIGHT = 650;
const NODE_MARGIN = 42;

const colors = ["#2563eb", "#0f766e", "#ea580c", "#7c3aed", "#be123c", "#475569", "#15803d"];
const relationshipTypes = ["结义", "君臣", "联盟", "亲友", "同事", "合作", "竞争", "介绍人", "客户", "导师", "自定义"];
const statuses = ["活跃", "普通", "疏远", "待确认"];
const followStatuses: FollowStatus[] = ["待跟进", "已联系", "观察中", "暂停"];
const methods = ["电话", "微信", "邮件", "面谈", "会议", "其他"];

const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};
const createId = () => crypto.randomUUID();
const splitTags = (value: string) => value.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean);
const formatDate = (value: string) => (value ? new Date(value).toLocaleDateString("zh-CN") : "未填写");
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizePerson = (raw: Partial<Person>): Person => ({
  id: raw.id || createId(),
  name: raw.name || "未命名",
  color: raw.color || colors[0],
  tags: Array.isArray(raw.tags) ? raw.tags : [],
  contact: raw.contact || "",
  organization: raw.organization || "",
  location: raw.location || "",
  note: raw.note || "",
  importance: (raw.importance || 3) as Importance,
  lastContactAt: raw.lastContactAt || "",
  nextFollowUpAt: raw.nextFollowUpAt || "",
  followStatus: raw.followStatus || "观察中",
  warmth: raw.warmth ?? 3,
  createdAt: raw.createdAt || now(),
  updatedAt: raw.updatedAt || now(),
});

const emptyPerson = (): Person =>
  normalizePerson({
    id: createId(),
    name: "",
    color: colors[Math.floor(Math.random() * colors.length)],
    followStatus: "待跟进",
    warmth: 3,
  });

const emptyRelationship = (fromId = "", toId = ""): Relationship => ({
  id: createId(),
  fromId,
  toId,
  type: "合作",
  directed: false,
  strength: 3,
  status: "活跃",
  startDate: "",
  endDate: "",
  note: "",
  createdAt: now(),
  updatedAt: now(),
});

const emptyInteraction = (personId = ""): Interaction => ({
  id: createId(),
  personId,
  date: today(),
  method: "微信",
  topic: "",
  result: "",
  nextStep: "",
  createdAt: now(),
});

const samplePeople = (): Person[] => {
  const stamp = now();
  return [
    ["p1", "刘备", "#2563eb", ["蜀汉", "君主", "仁德"], "玄德", "蜀汉", "成都", "以仁义聚拢人心，是蜀汉关系网的核心人物。", 5, addDays(-5), today(), "待跟进", 5],
    ["p2", "关羽", "#0f766e", ["蜀汉", "五虎将", "结义"], "云长", "蜀汉", "荆州", "桃园结义兄弟，忠义形象极强。", 5, addDays(-12), addDays(3), "观察中", 5],
    ["p3", "张飞", "#ea580c", ["蜀汉", "五虎将", "结义"], "翼德", "蜀汉", "阆中", "桃园结义兄弟，勇猛直接。", 4, addDays(-15), addDays(5), "观察中", 4],
    ["p4", "诸葛亮", "#7c3aed", ["蜀汉", "谋臣", "军师"], "孔明", "蜀汉", "隆中", "刘备三顾茅庐请出的军师，是蜀汉战略中枢。", 5, addDays(-2), addDays(1), "已联系", 5],
    ["p5", "曹操", "#be123c", ["曹魏", "枭雄", "君主"], "孟德", "曹魏", "许昌", "挟天子以令诸侯，北方势力核心。", 5, addDays(-20), addDays(-1), "待跟进", 4],
    ["p6", "孙权", "#475569", ["东吴", "君主", "联盟"], "仲谋", "东吴", "建业", "江东之主，与蜀汉既联盟又博弈。", 4, addDays(-8), addDays(6), "待跟进", 4],
    ["p7", "周瑜", "#15803d", ["东吴", "谋臣", "都督"], "公瑾", "东吴", "柴桑", "赤壁之战关键统帅，与诸葛亮互有较量。", 4, addDays(-30), addDays(4), "待跟进", 3],
    ["p8", "吕布", "#64748b", ["群雄", "猛将", "竞争"], "奉先", "群雄", "下邳", "武力绝伦但反复无常，与曹操、刘备都有复杂纠葛。", 3, "", "", "观察中", 2],
  ].map(([id, name, color, tags, contact, organization, location, note, importance, lastContactAt, nextFollowUpAt, followStatus, warmth]) =>
    normalizePerson({
      id: id as string,
      name: name as string,
      color: color as string,
      tags: tags as string[],
      contact: contact as string,
      organization: organization as string,
      location: location as string,
      note: note as string,
      importance: importance as Importance,
      lastContactAt: lastContactAt as string,
      nextFollowUpAt: nextFollowUpAt as string,
      followStatus: followStatus as FollowStatus,
      warmth: warmth as number,
      createdAt: stamp,
      updatedAt: stamp,
    }),
  );
};

const sampleRelationships = (): Relationship[] => {
  const stamp = now();
  return [
    ["r1", "p1", "p2", "结义", false, 5, "活跃", "桃园三结义，情同手足。"],
    ["r2", "p1", "p3", "结义", false, 5, "活跃", "桃园三结义，张飞追随刘备起兵。"],
    ["r3", "p4", "p1", "君臣", true, 5, "活跃", "刘备三顾茅庐，诸葛亮出山辅佐。"],
    ["r4", "p5", "p1", "竞争", false, 4, "活跃", "曹操与刘备多次争夺天下大势。"],
    ["r5", "p1", "p6", "联盟", false, 4, "普通", "孙刘联盟共同抗曹，但利益并不完全一致。"],
    ["r6", "p6", "p7", "君臣", true, 5, "活跃", "孙权倚重周瑜统领东吴军务。"],
    ["r7", "p7", "p4", "竞争", false, 3, "普通", "赤壁前后周瑜与诸葛亮互相试探较量。"],
    ["r8", "p5", "p8", "竞争", false, 4, "疏远", "曹操最终擒杀吕布。"],
    ["r9", "p1", "p8", "合作", false, 2, "疏远", "刘备曾依附吕布，后关系破裂。"],
  ].map(([id, fromId, toId, type, directed, strength, status, note]) => ({
    id: id as string,
    fromId: fromId as string,
    toId: toId as string,
    type: type as string,
    directed: directed as boolean,
    strength: strength as number,
    status: status as string,
    startDate: "",
    endDate: "",
    note: note as string,
    createdAt: stamp,
    updatedAt: stamp,
  }));
};

const sampleInteractions = (): Interaction[] => [
  {
    id: "i1",
    personId: "p1",
    date: addDays(-5),
    method: "面谈",
    topic: "隆中路线复盘",
    result: "明确联吴抗曹、取荆益二州的长期路线。",
    nextStep: "跟进诸葛亮与关张的战略协同。",
    createdAt: now(),
  },
  {
    id: "i2",
    personId: "p4",
    date: addDays(-3),
    method: "会议",
    topic: "赤壁联盟推演",
    result: "建议继续稳固孙刘联盟，同时防范荆州归属冲突。",
    nextStep: "观察孙权、周瑜关系变化。",
    createdAt: now(),
  },
  {
    id: "i3",
    personId: "p5",
    date: addDays(-20),
    method: "其他",
    topic: "北方势力评估",
    result: "曹操仍是当前关系网中最强竞争核心。",
    nextStep: "重点追踪曹操与孙刘联盟的冲突路径。",
    createdAt: now(),
  },
];

function App() {
  const [people, setPeople] = useState<Person[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [positions, setPositions] = useState<Record<string, GraphPosition>>({});
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [selectedRelationshipId, setSelectedRelationshipId] = useState("");
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [editingRelationship, setEditingRelationship] = useState<Relationship | null>(null);
  const [editingInteraction, setEditingInteraction] = useState<Interaction | null>(null);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [minImportance, setMinImportance] = useState(1);
  const [minStrength, setMinStrength] = useState(1);
  const [pathFrom, setPathFrom] = useState("");
  const [pathTo, setPathTo] = useState("");
  const [highlightPath, setHighlightPath] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [layoutLocked, setLayoutLocked] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      const nextPeople = Array.isArray(parsed.people) ? parsed.people.map(normalizePerson) : [];
      setPeople(nextPeople);
      setRelationships(Array.isArray(parsed.relationships) ? parsed.relationships : []);
      setInteractions(Array.isArray(parsed.interactions) ? parsed.interactions : []);
      setPositions(parsed.positions ?? {});
      setSelectedPersonId(nextPeople[0]?.id ?? "");
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const persistState = useCallback(
    (nextPositions = positions) => {
      const state: PersistedState = {
        version: 2,
        people,
        relationships,
        interactions,
        positions: nextPositions,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    },
    [people, relationships, interactions, positions],
  );

  useEffect(() => {
    persistState();
  }, [people, relationships, interactions, persistState]);

  useEffect(() => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => persistState(positions), 400);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [positions, persistState]);

  useEffect(() => {
    setPositions((current) => normalizePositions(people, current));
  }, [people]);

  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const selectedPerson = peopleById.get(selectedPersonId) ?? null;
  const selectedRelationship = relationships.find((relationship) => relationship.id === selectedRelationshipId) ?? null;
  const allTags = useMemo(() => Array.from(new Set(people.flatMap((person) => person.tags))).sort(), [people]);
  const tagOptions = useMemo(() => {
    const counts = new Map<string, number>();
    people.forEach((person) => person.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
    return allTags
      .map((tag) => ({ tag, count: counts.get(tag) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "zh-CN"));
  }, [allTags, people]);
  const followupGroups = useMemo(() => buildFollowupGroups(people), [people]);
  const existingRelationshipTypes = useMemo(() => {
    const existing = new Set(relationships.map((relationship) => relationship.type).filter(Boolean));
    return [...existing].sort((a, b) => {
      const aIndex = relationshipTypes.indexOf(a);
      const bIndex = relationshipTypes.indexOf(b);
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b, "zh-CN");
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }, [relationships]);

  const visiblePeople = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return people.filter((person) => {
      const text = [person.name, person.contact, person.organization, person.location, person.note, person.followStatus, person.tags.join(" ")]
        .join(" ")
        .toLowerCase();
      return (
        (!normalizedQuery || text.includes(normalizedQuery)) &&
        (!tagFilter || person.tags.includes(tagFilter)) &&
        person.importance >= minImportance
      );
    });
  }, [people, query, tagFilter, minImportance]);

  const visiblePersonIds = useMemo(() => new Set(visiblePeople.map((person) => person.id)), [visiblePeople]);
  const visibleRelationships = useMemo(
    () =>
      relationships.filter(
        (relationship) =>
          visiblePersonIds.has(relationship.fromId) &&
          visiblePersonIds.has(relationship.toId) &&
          (!typeFilter || relationship.type === typeFilter) &&
          relationship.strength >= minStrength,
      ),
    [relationships, visiblePersonIds, typeFilter, minStrength],
  );

  const selectedDirectRelationships = useMemo(
    () => relationships.filter((relationship) => relationship.fromId === selectedPersonId || relationship.toId === selectedPersonId),
    [relationships, selectedPersonId],
  );
  const selectedInteractions = useMemo(
    () => interactions.filter((interaction) => interaction.personId === selectedPersonId).sort((a, b) => b.date.localeCompare(a.date)),
    [interactions, selectedPersonId],
  );
  const analysis = useMemo(() => buildAnalysis(people, relationships), [people, relationships]);
  const pathResult = useMemo(() => findShortestPath(pathFrom, pathTo, relationships), [pathFrom, pathTo, relationships]);
  const commonContacts = useMemo(
    () => findCommonContacts(pathFrom, pathTo, people, relationships),
    [pathFrom, pathTo, people, relationships],
  );

  useEffect(() => {
    if (typeFilter && !existingRelationshipTypes.includes(typeFilter)) setTypeFilter("");
  }, [existingRelationshipTypes, typeFilter]);

  const savePerson = (event: FormEvent) => {
    event.preventDefault();
    if (!editingPerson?.name.trim()) return;
    const person = { ...editingPerson, name: editingPerson.name.trim(), updatedAt: now() };
    setPeople((current) => (current.some((item) => item.id === person.id) ? current.map((item) => (item.id === person.id ? person : item)) : [...current, person]));
    setSelectedPersonId(person.id);
    setModalMode(null);
  };

  const saveRelationship = (event: FormEvent) => {
    event.preventDefault();
    if (!editingRelationship?.fromId || !editingRelationship.toId || editingRelationship.fromId === editingRelationship.toId) return;
    const relationship = { ...editingRelationship, updatedAt: now() };
    setRelationships((current) =>
      current.some((item) => item.id === relationship.id) ? current.map((item) => (item.id === relationship.id ? relationship : item)) : [...current, relationship],
    );
    setSelectedRelationshipId(relationship.id);
    setModalMode(null);
  };

  const saveInteraction = (event: FormEvent) => {
    event.preventDefault();
    if (!editingInteraction?.personId || !editingInteraction.topic.trim()) return;
    const interaction = { ...editingInteraction, topic: editingInteraction.topic.trim() };
    setInteractions((current) =>
      current.some((item) => item.id === interaction.id) ? current.map((item) => (item.id === interaction.id ? interaction : item)) : [...current, interaction],
    );
    setPeople((current) =>
      current.map((person) =>
        person.id === interaction.personId
          ? {
              ...person,
              lastContactAt: interaction.date,
              followStatus: "已联系",
              updatedAt: now(),
            }
          : person,
      ),
    );
    setModalMode(null);
  };

  const deletePerson = (id: string) => {
    const linkedCount = relationships.filter((item) => item.fromId === id || item.toId === id).length;
    const person = peopleById.get(id);
    if (!confirm(`确定删除「${person?.name ?? "该人物"}」吗？将同时删除 ${linkedCount} 条关联关系和互动记录。`)) return;
    setPeople((current) => current.filter((item) => item.id !== id));
    setRelationships((current) => current.filter((item) => item.fromId !== id && item.toId !== id));
    setInteractions((current) => current.filter((item) => item.personId !== id));
    if (selectedPersonId === id) setSelectedPersonId("");
  };

  const deleteRelationship = (id: string) => {
    if (!confirm("确定删除这条关系吗？")) return;
    setRelationships((current) => current.filter((item) => item.id !== id));
    if (selectedRelationshipId === id) setSelectedRelationshipId("");
  };

  const loadSamples = () => {
    if (people.length > 0 && !confirm("示例数据会替换当前数据，是否继续？")) return;
    const nextPeople = samplePeople();
    setPeople(nextPeople);
    setRelationships(sampleRelationships());
    setInteractions(sampleInteractions());
    setPositions(normalizePositions(nextPeople, {}));
    setSelectedPersonId(nextPeople[0].id);
    setSelectedRelationshipId("");
    setHighlightPath([]);
  };

  const clearData = () => {
    if (!confirm("确定清空所有人物、关系和互动记录吗？此操作无法撤销。")) return;
    setPeople([]);
    setRelationships([]);
    setInteractions([]);
    setPositions({});
    setSelectedPersonId("");
    setSelectedRelationshipId("");
    setHighlightPath([]);
  };

  const tidyLayout = () => {
    setPositions(normalizePositions(people, {}, true));
  };

  const exportData = () => {
    const state: PersistedState = {
      version: 2,
      exportedAt: now(),
      people,
      relationships,
      interactions,
      positions,
    };
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `人物关系备份-${today()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importData = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const imported = validateImportedState(parsed);
        setPeople(imported.people);
        setRelationships(imported.relationships);
        setInteractions(imported.interactions);
        setPositions(imported.positions);
        setSelectedPersonId(imported.people[0]?.id ?? "");
        setHighlightPath([]);
      } catch (error) {
        alert(`导入失败：${error instanceof Error ? error.message : "请选择有效 JSON 文件。"}`);
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const openPersonModal = (person?: Person) => {
    setEditingPerson(person ? { ...person } : emptyPerson());
    setModalMode("person");
  };

  const openRelationshipModal = (relationship?: Relationship) => {
    const fallbackFrom = selectedPersonId || people[0]?.id || "";
    const fallbackTo = people.find((person) => person.id !== fallbackFrom)?.id || "";
    setEditingRelationship(relationship ? { ...relationship } : emptyRelationship(fallbackFrom, fallbackTo));
    setModalMode("relationship");
  };

  const openInteractionModal = (personId = selectedPersonId) => {
    setEditingInteraction(emptyInteraction(personId));
    setModalMode("interaction");
  };

  const applyPathHighlight = () => {
    const ids = pathResult?.peopleIds ?? [];
    setHighlightPath(ids);
    if (ids[0]) setSelectedPersonId(ids[0]);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Relationship Manager</p>
          <h1>人物关系管理系统</h1>
        </div>
        <div className="toolbar">
          <button onClick={() => openPersonModal()} title="新增人物">
            <UserRoundPlus size={18} /> 新增人物
          </button>
          <button onClick={() => openRelationshipModal()} disabled={people.length < 2} title="新增关系">
            <Link2 size={18} /> 新增关系
          </button>
          <button onClick={() => openInteractionModal()} disabled={!selectedPersonId} title="记录互动">
            <Plus size={18} /> 互动
          </button>
          <button onClick={() => setModalMode("path")} disabled={people.length < 2} title="关系追溯">
            <Network size={18} /> 追溯
          </button>
          <button onClick={() => setModalMode("followups")} title="待跟进">
            <Bell size={18} /> 待跟进
          </button>
          <button onClick={() => setModalMode("analysis")} title="网络分析">
            <Users size={18} /> 分析
          </button>
          <button onClick={loadSamples} title="载入示例数据">
            <RefreshCw size={18} /> 示例
          </button>
          <button onClick={() => fileRef.current?.click()} title="导入 JSON">
            <FileUp size={18} /> 导入
          </button>
          <button onClick={exportData} disabled={!people.length} title="导出 JSON">
            <Download size={18} /> 导出
          </button>
          <button className="danger" onClick={clearData} disabled={!people.length} title="清空数据">
            <Trash2 size={18} /> 清空
          </button>
          <input ref={fileRef} className="hidden-file" type="file" accept="application/json" onChange={importData} />
        </div>
      </header>

      <main className="workspace">
        <aside className="sidebar left-panel">
          <section className="panel-header">
            <div>
              <p className="eyebrow">People</p>
              <h2>人物库</h2>
            </div>
            <span className="counter">{visiblePeople.length}/{people.length}</span>
          </section>
          <label className="search-box">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名、组织、备注" />
          </label>
          <div className="filters">
            <div className="tag-filter">
              <div className="filter-title"><span><Filter size={15} /> 标签筛选</span>{tagFilter && <button type="button" onClick={() => setTagFilter("")}>重置</button>}</div>
              <div className="tag-options">
                <button type="button" className={!tagFilter ? "active" : ""} onClick={() => setTagFilter("")}>
                  全部 <span>{people.length}</span>
                </button>
                {tagOptions.map(({ tag, count }) => (
                  <button type="button" className={tagFilter === tag ? "active" : ""} key={tag} onClick={() => setTagFilter(tag)}>
                    {tag} <span>{count}</span>
                  </button>
                ))}
              </div>
            </div>
            <label>
              重要度
              <input type="range" min="1" max="5" value={minImportance} onChange={(event) => setMinImportance(Number(event.target.value))} />
              <span>{minImportance}+</span>
            </label>
          </div>
          <div className="person-list">
            {visiblePeople.map((person) => (
              <button
                className={`person-card ${selectedPersonId === person.id ? "active" : ""}`}
                key={person.id}
                onClick={() => {
                  setSelectedPersonId(person.id);
                  setSelectedRelationshipId("");
                }}
              >
                <span className="avatar" style={{ backgroundColor: person.color }}>{person.name.slice(0, 1)}</span>
                <span>
                  <strong>{person.name}</strong>
                  <small>{person.followStatus} · 温度 {person.warmth}/5 · {person.organization || "未填写组织"}</small>
                </span>
              </button>
            ))}
            {!people.length && (
              <div className="empty-state">
                <p>还没有人物数据。</p>
                <button onClick={loadSamples}>载入示例数据</button>
              </div>
            )}
          </div>
        </aside>

        <section className="graph-panel">
          <div className="graph-controls">
            <label>
              关系类型
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option value="">全部</option>
                {existingRelationshipTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>
            <label>
              强度 {minStrength}+
              <input type="range" min="1" max="5" value={minStrength} onChange={(event) => setMinStrength(Number(event.target.value))} />
            </label>
            <label>
              缩放
              <input type="range" min="0.6" max="1.6" step="0.1" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
            </label>
            <button onClick={tidyLayout} disabled={!people.length} title="一键整理布局">
              <Sparkles size={16} /> 整理布局
            </button>
            <button onClick={() => setLayoutLocked((value) => !value)} title="锁定布局">
              {layoutLocked ? <Lock size={16} /> : <Unlock size={16} />} {layoutLocked ? "已锁定" : "可拖拽"}
            </button>
            {highlightPath.length > 0 && (
              <button onClick={() => setHighlightPath([])}>
                <X size={16} /> 清除路径
              </button>
            )}
          </div>
          <RelationshipGraph
            people={visiblePeople}
            relationships={visibleRelationships}
            peopleById={peopleById}
            positions={positions}
            zoom={zoom}
            layoutLocked={layoutLocked}
            selectedPersonId={selectedPersonId}
            selectedRelationshipId={selectedRelationshipId}
            highlightPath={highlightPath}
            onSelectPerson={(id) => {
              setSelectedPersonId(id);
              setSelectedRelationshipId("");
            }}
            onSelectRelationship={setSelectedRelationshipId}
            onMoveEnd={(id, point) => setPositions((current) => ({ ...current, [id]: point }))}
          />
        </section>

        <aside className="sidebar detail-panel">
          <section className="panel-header">
            <div>
              <p className="eyebrow">Details</p>
              <h2>详情</h2>
            </div>
          </section>
          {selectedRelationship ? (
            <RelationshipDetail relationship={selectedRelationship} peopleById={peopleById} onEdit={() => openRelationshipModal(selectedRelationship)} onDelete={() => deleteRelationship(selectedRelationship.id)} />
          ) : selectedPerson ? (
            <PersonDetail
              person={selectedPerson}
              relationships={selectedDirectRelationships}
              interactions={selectedInteractions}
              peopleById={peopleById}
              suggestions={buildSuggestions(selectedPerson, selectedDirectRelationships)}
              onEdit={() => openPersonModal(selectedPerson)}
              onDelete={() => deletePerson(selectedPerson.id)}
              onAddInteraction={() => openInteractionModal(selectedPerson.id)}
              onSelectRelationship={setSelectedRelationshipId}
            />
          ) : (
            <div className="empty-state">
              <p>选择一个人物或关系查看详情。</p>
            </div>
          )}
        </aside>
      </main>

      {modalMode === "person" && editingPerson && (
        <Modal title={people.some((item) => item.id === editingPerson.id) ? "编辑人物" : "新增人物"} onClose={() => setModalMode(null)}>
          <form className="form-grid" onSubmit={savePerson}>
            <label>姓名<input value={editingPerson.name} onChange={(event) => setEditingPerson({ ...editingPerson, name: event.target.value })} required /></label>
            <label>颜色<div className="swatches">{colors.map((color) => <button type="button" className={editingPerson.color === color ? "selected" : ""} key={color} style={{ backgroundColor: color }} onClick={() => setEditingPerson({ ...editingPerson, color })} title={color} />)}</div></label>
            <label>标签<input value={editingPerson.tags.join("，")} onChange={(event) => setEditingPerson({ ...editingPerson, tags: splitTags(event.target.value) })} placeholder="产品，核心" /></label>
            <label>重要程度 {editingPerson.importance}<input type="range" min="1" max="5" value={editingPerson.importance} onChange={(event) => setEditingPerson({ ...editingPerson, importance: Number(event.target.value) as Importance })} /></label>
            <label>联系方式<input value={editingPerson.contact} onChange={(event) => setEditingPerson({ ...editingPerson, contact: event.target.value })} /></label>
            <label>组织<input value={editingPerson.organization} onChange={(event) => setEditingPerson({ ...editingPerson, organization: event.target.value })} /></label>
            <label>地点<input value={editingPerson.location} onChange={(event) => setEditingPerson({ ...editingPerson, location: event.target.value })} /></label>
            <label>最近联系<input type="date" value={editingPerson.lastContactAt} onChange={(event) => setEditingPerson({ ...editingPerson, lastContactAt: event.target.value })} /></label>
            <label>下次跟进<input type="date" value={editingPerson.nextFollowUpAt} onChange={(event) => setEditingPerson({ ...editingPerson, nextFollowUpAt: event.target.value })} /></label>
            <label>跟进状态<select value={editingPerson.followStatus} onChange={(event) => setEditingPerson({ ...editingPerson, followStatus: event.target.value as FollowStatus })}>{followStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
            <label>关系温度 {editingPerson.warmth}<input type="range" min="1" max="5" value={editingPerson.warmth} onChange={(event) => setEditingPerson({ ...editingPerson, warmth: Number(event.target.value) })} /></label>
            <label className="wide">备注<textarea value={editingPerson.note} onChange={(event) => setEditingPerson({ ...editingPerson, note: event.target.value })} /></label>
            <div className="form-actions wide"><button type="button" className="secondary" onClick={() => setModalMode(null)}>取消</button><button type="submit">保存人物</button></div>
          </form>
        </Modal>
      )}

      {modalMode === "relationship" && editingRelationship && (
        <Modal title={relationships.some((item) => item.id === editingRelationship.id) ? "编辑关系" : "新增关系"} onClose={() => setModalMode(null)}>
          <form className="form-grid" onSubmit={saveRelationship}>
            <label>起点人物<select value={editingRelationship.fromId} onChange={(event) => setEditingRelationship({ ...editingRelationship, fromId: event.target.value })} required><option value="">请选择</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
            <label>终点人物<select value={editingRelationship.toId} onChange={(event) => setEditingRelationship({ ...editingRelationship, toId: event.target.value })} required><option value="">请选择</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
            <label>关系类型<input list="relationship-types" value={editingRelationship.type} onChange={(event) => setEditingRelationship({ ...editingRelationship, type: event.target.value })} /><datalist id="relationship-types">{relationshipTypes.map((type) => <option key={type} value={type} />)}</datalist></label>
            <label>状态<select value={editingRelationship.status} onChange={(event) => setEditingRelationship({ ...editingRelationship, status: event.target.value })}>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
            <label>强度 {editingRelationship.strength}<input type="range" min="1" max="5" value={editingRelationship.strength} onChange={(event) => setEditingRelationship({ ...editingRelationship, strength: Number(event.target.value) })} /></label>
            <label className="checkbox-row"><input type="checkbox" checked={editingRelationship.directed} onChange={(event) => setEditingRelationship({ ...editingRelationship, directed: event.target.checked })} />单向关系</label>
            <label>开始时间<input type="date" value={editingRelationship.startDate} onChange={(event) => setEditingRelationship({ ...editingRelationship, startDate: event.target.value })} /></label>
            <label>结束时间<input type="date" value={editingRelationship.endDate} onChange={(event) => setEditingRelationship({ ...editingRelationship, endDate: event.target.value })} /></label>
            <label className="wide">备注<textarea value={editingRelationship.note} onChange={(event) => setEditingRelationship({ ...editingRelationship, note: event.target.value })} /></label>
            <div className="form-actions wide"><button type="button" className="secondary" onClick={() => setModalMode(null)}>取消</button><button type="submit">保存关系</button></div>
          </form>
        </Modal>
      )}

      {modalMode === "interaction" && editingInteraction && (
        <Modal title="记录互动" onClose={() => setModalMode(null)}>
          <form className="form-grid" onSubmit={saveInteraction}>
            <label>人物<select value={editingInteraction.personId} onChange={(event) => setEditingInteraction({ ...editingInteraction, personId: event.target.value })} required>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
            <label>日期<input type="date" value={editingInteraction.date} onChange={(event) => setEditingInteraction({ ...editingInteraction, date: event.target.value })} /></label>
            <label>方式<select value={editingInteraction.method} onChange={(event) => setEditingInteraction({ ...editingInteraction, method: event.target.value })}>{methods.map((method) => <option key={method} value={method}>{method}</option>)}</select></label>
            <label>主题<input value={editingInteraction.topic} onChange={(event) => setEditingInteraction({ ...editingInteraction, topic: event.target.value })} required /></label>
            <label className="wide">结果<textarea value={editingInteraction.result} onChange={(event) => setEditingInteraction({ ...editingInteraction, result: event.target.value })} /></label>
            <label className="wide">下一步<textarea value={editingInteraction.nextStep} onChange={(event) => setEditingInteraction({ ...editingInteraction, nextStep: event.target.value })} /></label>
            <div className="form-actions wide"><button type="button" className="secondary" onClick={() => setModalMode(null)}>取消</button><button type="submit">保存互动</button></div>
          </form>
        </Modal>
      )}

      {modalMode === "path" && (
        <Modal title="关系追溯" onClose={() => setModalMode(null)}>
          <div className="path-tool">
            <div className="form-grid">
              <label>起点<select value={pathFrom} onChange={(event) => setPathFrom(event.target.value)}><option value="">请选择</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
              <label>终点<select value={pathTo} onChange={(event) => setPathTo(event.target.value)}><option value="">请选择</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
            </div>
            {pathFrom && pathTo && pathFrom === pathTo && <p className="notice">起点和终点是同一个人。</p>}
            {pathFrom && pathTo && pathFrom !== pathTo && (
              <section className="common-contact-result">
                <div className="common-contact-title">
                  <div><span>共同联系人</span><strong>{peopleById.get(pathFrom)?.name} 与 {peopleById.get(pathTo)?.name}</strong></div>
                  <b>{commonContacts.length} 位</b>
                </div>
                {commonContacts.length ? (
                  <div className="shared-contact-people">
                    {commonContacts.map((person) => (
                      <button type="button" key={person.id} onClick={() => { setSelectedPersonId(person.id); setSelectedRelationshipId(""); setModalMode(null); }}>
                        <span className="contact-dot" style={{ backgroundColor: person.color }} />{person.name}
                      </button>
                    ))}
                  </div>
                ) : <p className="muted">两人暂时没有共同的直接联系人。</p>}
              </section>
            )}
            {pathFrom && pathTo && pathFrom !== pathTo && !pathResult && <p className="notice">暂未找到两人之间的连接路径。</p>}
            {pathResult && (
              <div className="path-result">
                <h3>最短路径：{pathResult.peopleIds.length - 1} 步</h3>
                {pathResult.steps.map((step) => (
                  <div className="path-step" key={step.relationship.id}>
                    <strong>{peopleById.get(step.from)?.name}</strong>
                    <span>{step.relationship.type} · 强度 {step.relationship.strength}</span>
                    <strong>{peopleById.get(step.to)?.name}</strong>
                  </div>
                ))}
                <button onClick={applyPathHighlight}>在图谱中高亮</button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {modalMode === "followups" && (
        <Modal title="待跟进" onClose={() => setModalMode(null)}>
          <FollowupPanel groups={followupGroups} onSelect={(id) => { setSelectedPersonId(id); setSelectedRelationshipId(""); setModalMode(null); }} />
        </Modal>
      )}

      {modalMode === "analysis" && (
        <Modal title="社交网络分析" onClose={() => setModalMode(null)}>
          <div className="analysis-grid">
            <Metric label="人物总数" value={people.length} />
            <Metric label="关系总数" value={relationships.length} />
            <Metric label="强关系" value={analysis.strongRelationships.length} />
            <Metric label="孤立人物" value={analysis.isolatedPeople.length} />
            <section><h3>中心人物</h3>{analysis.centralPeople.map((item) => <button className="rank-row" key={item.person.id} onClick={() => setSelectedPersonId(item.person.id)}><span>{item.person.name}</span><strong>{item.score} 条连接</strong></button>)}</section>
            <section><h3>强关系列表</h3>{analysis.strongRelationships.map((relationship) => <div className="rank-row" key={relationship.id}><span>{peopleById.get(relationship.fromId)?.name} - {peopleById.get(relationship.toId)?.name}</span><strong>{relationship.strength}</strong></div>)}</section>
            <section><h3>孤立人物</h3>{analysis.isolatedPeople.length ? analysis.isolatedPeople.map((person) => <span className="tag" key={person.id}>{person.name}</span>) : <p className="muted">暂无</p>}</section>
          </div>
        </Modal>
      )}
    </div>
  );
}

function RelationshipGraph({
  people,
  relationships,
  peopleById,
  positions,
  zoom,
  layoutLocked,
  selectedPersonId,
  selectedRelationshipId,
  highlightPath,
  onSelectPerson,
  onSelectRelationship,
  onMoveEnd,
}: {
  people: Person[];
  relationships: Relationship[];
  peopleById: Map<string, Person>;
  positions: Record<string, GraphPosition>;
  zoom: number;
  layoutLocked: boolean;
  selectedPersonId: string;
  selectedRelationshipId: string;
  highlightPath: string[];
  onSelectPerson: (id: string) => void;
  onSelectRelationship: (id: string) => void;
  onMoveEnd: (id: string, point: GraphPosition) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ id: string; pointerId: number; point: GraphPosition } | null>(null);
  const frameRef = useRef<number | null>(null);
  const positionsRef = useRef(positions);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    positionsRef.current = positions;
    applyAllGraphPositions(positions, relationships);
  }, [positions, relationships]);

  useEffect(() => {
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const highlightedEdges = useMemo(() => {
    const edges = new Set<string>();
    for (let index = 0; index < highlightPath.length - 1; index += 1) {
      edges.add(`${highlightPath[index]}:${highlightPath[index + 1]}`);
      edges.add(`${highlightPath[index + 1]}:${highlightPath[index]}`);
    }
    return edges;
  }, [highlightPath]);

  const clientToGraphPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: clamp(((clientX - rect.left) / rect.width) * (GRAPH_WIDTH / zoom), NODE_MARGIN, GRAPH_WIDTH / zoom - NODE_MARGIN),
      y: clamp(((clientY - rect.top) / rect.height) * (GRAPH_HEIGHT / zoom), NODE_MARGIN, GRAPH_HEIGHT / zoom - NODE_MARGIN),
    };
  };

  const scheduleDomMove = (id: string, point: GraphPosition) => {
    positionsRef.current = { ...positionsRef.current, [id]: point };
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      applyNodePosition(id, point, relationships, positionsRef.current);
    });
  };

  const finishDrag = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setIsDragging(false);
    onMoveEnd(drag.id, drag.point);
  };

  const startDrag = (event: ReactPointerEvent<SVGGElement>, personId: string) => {
    onSelectPerson(personId);
    if (layoutLocked) return;
    const point = clientToGraphPoint(event.clientX, event.clientY);
    dragRef.current = { id: personId, pointerId: event.pointerId, point };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  };

  const moveDrag = (event: ReactPointerEvent<SVGGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.point = clientToGraphPoint(event.clientX, event.clientY);
    scheduleDomMove(drag.id, drag.point);
  };

  if (!people.length) {
    return <div className="graph-empty">添加人物后，这里会显示可拖拽关系图。</div>;
  }

  return (
    <svg
      ref={svgRef}
      className={`relationship-graph ${isDragging ? "dragging" : ""} ${layoutLocked ? "locked" : ""}`}
      viewBox={`0 0 ${GRAPH_WIDTH / zoom} ${GRAPH_HEIGHT / zoom}`}
      onPointerLeave={finishDrag}
      onPointerCancel={finishDrag}
      onLostPointerCapture={finishDrag}
    >
      <defs>
        <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L9,3 z" fill="#64748b" />
        </marker>
      </defs>
      {relationships.map((relationship) => {
        const from = positions[relationship.fromId];
        const to = positions[relationship.toId];
        if (!from || !to || !peopleById.get(relationship.fromId) || !peopleById.get(relationship.toId)) return null;
        const isHighlighted = highlightedEdges.has(`${relationship.fromId}:${relationship.toId}`);
        return (
          <g
            className={`edge ${selectedRelationshipId === relationship.id ? "selected" : ""} ${isHighlighted ? "highlighted" : ""}`}
            data-edge-id={relationship.id}
            key={relationship.id}
            onClick={() => onSelectRelationship(relationship.id)}
          >
            <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} strokeWidth={1.5 + relationship.strength} markerEnd={relationship.directed ? "url(#arrow)" : undefined} />
            <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 8}>{relationship.type}</text>
          </g>
        );
      })}
      {people.map((person) => {
        const point = positions[person.id] ?? { x: 120, y: 120 };
        const radius = 20 + person.importance * 4;
        return (
          <g
            className={`node ${selectedPersonId === person.id ? "selected" : ""} ${highlightPath.includes(person.id) ? "highlighted" : ""}`}
            data-node-id={person.id}
            key={person.id}
            onPointerDown={(event) => startDrag(event, person.id)}
            onPointerMove={moveDrag}
            onPointerUp={finishDrag}
          >
            <circle cx={point.x} cy={point.y} r={radius} fill={person.color} />
            <text x={point.x} y={point.y + 5}>{person.name}</text>
          </g>
        );
      })}
    </svg>
  );
}

function PersonDetail({
  person,
  relationships,
  interactions,
  peopleById,
  suggestions,
  onEdit,
  onDelete,
  onAddInteraction,
  onSelectRelationship,
}: {
  person: Person;
  relationships: Relationship[];
  interactions: Interaction[];
  peopleById: Map<string, Person>;
  suggestions: string[];
  onEdit: () => void;
  onDelete: () => void;
  onAddInteraction: () => void;
  onSelectRelationship: (id: string) => void;
}) {
  return (
    <div className="detail-card">
      <div className="profile-head">
        <span className="avatar large" style={{ backgroundColor: person.color }}>{person.name.slice(0, 1)}</span>
        <div><h3>{person.name}</h3><p>{person.organization || "未填写组织"}</p></div>
      </div>
      <div className="tags">{person.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>
      <dl>
        <dt>联系方式</dt><dd>{person.contact || "未填写"}</dd>
        <dt>地点</dt><dd>{person.location || "未填写"}</dd>
        <dt>重要程度</dt><dd>{person.importance}/5</dd>
        <dt>关系温度</dt><dd>{person.warmth}/5</dd>
        <dt>最近联系</dt><dd>{formatDate(person.lastContactAt)}</dd>
        <dt>下次跟进</dt><dd>{formatDate(person.nextFollowUpAt)}</dd>
        <dt>状态</dt><dd>{person.followStatus}</dd>
      </dl>
      <p className="note">{person.note || "暂无备注"}</p>
      <div className="suggestions">
        <h3>跟进建议</h3>
        {suggestions.map((item) => <p key={item}>{item}</p>)}
      </div>
      <div className="button-row"><button onClick={onEdit}>编辑</button><button onClick={onAddInteraction}>记录互动</button><button className="danger" onClick={onDelete}>删除</button></div>
      <h3>直接关系</h3>
      <div className="relation-list">
        {relationships.map((relationship) => {
          const otherId = relationship.fromId === person.id ? relationship.toId : relationship.fromId;
          return <button key={relationship.id} onClick={() => onSelectRelationship(relationship.id)}><strong>{peopleById.get(otherId)?.name ?? "未知人物"}</strong><span>{relationship.type} · 强度 {relationship.strength}</span></button>;
        })}
        {!relationships.length && <p className="muted">暂无直接关系</p>}
      </div>
      <h3>互动记录</h3>
      <div className="interaction-list">
        {interactions.map((interaction) => (
          <article key={interaction.id}>
            <strong>{interaction.date} · {interaction.method}</strong>
            <span>{interaction.topic}</span>
            <p>{interaction.result || "未填写结果"}</p>
            {interaction.nextStep && <small>下一步：{interaction.nextStep}</small>}
          </article>
        ))}
        {!interactions.length && <p className="muted">暂无互动记录</p>}
      </div>
    </div>
  );
}

function RelationshipDetail({ relationship, peopleById, onEdit, onDelete }: { relationship: Relationship; peopleById: Map<string, Person>; onEdit: () => void; onDelete: () => void }) {
  const from = peopleById.get(relationship.fromId);
  const to = peopleById.get(relationship.toId);
  return (
    <div className="detail-card">
      <h3>{from?.name ?? "未知"} {relationship.directed ? "→" : "-"} {to?.name ?? "未知"}</h3>
      <dl><dt>关系类型</dt><dd>{relationship.type}</dd><dt>强度</dt><dd>{relationship.strength}/5</dd><dt>状态</dt><dd>{relationship.status}</dd><dt>开始</dt><dd>{relationship.startDate || "未填写"}</dd><dt>结束</dt><dd>{relationship.endDate || "未填写"}</dd></dl>
      <p className="note">{relationship.note || "暂无备注"}</p>
      <div className="button-row"><button onClick={onEdit}>编辑</button><button className="danger" onClick={onDelete}>删除</button></div>
    </div>
  );
}

function FollowupPanel({ groups, onSelect }: { groups: ReturnType<typeof buildFollowupGroups>; onSelect: (id: string) => void }) {
  return (
    <div className="followup-panel">
      {[
        ["逾期", groups.overdue],
        ["今天", groups.today],
        ["本周", groups.thisWeek],
      ].map(([title, items]) => (
        <section key={title as string}>
          <h3><CalendarClock size={17} /> {title as string}</h3>
          {(items as Person[]).map((person) => <button className="rank-row" key={person.id} onClick={() => onSelect(person.id)}><span>{person.name}</span><strong>{person.nextFollowUpAt}</strong></button>)}
          {!(items as Person[]).length && <p className="muted">暂无</p>}
        </section>
      ))}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <header><h2>{title}</h2><button className="icon-button" onClick={onClose} title="关闭"><X size={18} /></button></header>
        {children}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function normalizePositions(people: Person[], current: Record<string, GraphPosition>, force = false) {
  const next: Record<string, GraphPosition> = force ? {} : { ...current };
  const radius = Math.max(150, people.length * 34);
  people.forEach((person, index) => {
    if (!force && next[person.id]) return;
    const angle = (index / Math.max(people.length, 1)) * Math.PI * 2;
    next[person.id] = {
      x: GRAPH_WIDTH / 2 + Math.cos(angle) * radius,
      y: GRAPH_HEIGHT / 2 + Math.sin(angle) * radius,
    };
  });
  Object.keys(next).forEach((id) => {
    if (!people.some((person) => person.id === id)) delete next[id];
  });
  return next;
}

function applyAllGraphPositions(positions: Record<string, GraphPosition>, relationships: Relationship[]) {
  Object.entries(positions).forEach(([id, point]) => applyNodePosition(id, point, relationships, positions));
}

function applyNodePosition(id: string, point: GraphPosition, relationships: Relationship[], positions: Record<string, GraphPosition>) {
  const group = document.querySelector<SVGGElement>(`[data-node-id="${id}"]`);
  group?.querySelector("circle")?.setAttribute("cx", String(point.x));
  group?.querySelector("circle")?.setAttribute("cy", String(point.y));
  group?.querySelector("text")?.setAttribute("x", String(point.x));
  group?.querySelector("text")?.setAttribute("y", String(point.y + 5));
  relationships.forEach((relationship) => {
    if (relationship.fromId !== id && relationship.toId !== id) return;
    const from = positions[relationship.fromId];
    const to = positions[relationship.toId];
    const edge = document.querySelector<SVGGElement>(`[data-edge-id="${relationship.id}"]`);
    const line = edge?.querySelector("line");
    const text = edge?.querySelector("text");
    if (!from || !to || !line || !text) return;
    line.setAttribute("x1", String(from.x));
    line.setAttribute("y1", String(from.y));
    line.setAttribute("x2", String(to.x));
    line.setAttribute("y2", String(to.y));
    text.setAttribute("x", String((from.x + to.x) / 2));
    text.setAttribute("y", String((from.y + to.y) / 2 - 8));
  });
}

function validateImportedState(raw: unknown): PersistedState {
  if (!raw || typeof raw !== "object") throw new Error("文件结构无效。");
  const data = raw as Partial<PersistedState>;
  if (!Array.isArray(data.people) || !Array.isArray(data.relationships)) throw new Error("缺少人物或关系数据。");
  const ids = new Set<string>();
  const people = data.people.map(normalizePerson);
  people.forEach((person) => {
    if (ids.has(person.id)) throw new Error(`人物 ID 重复：${person.id}`);
    ids.add(person.id);
  });
  const relationships = data.relationships as Relationship[];
  const broken = relationships.find((relationship) => !ids.has(relationship.fromId) || !ids.has(relationship.toId));
  if (broken) throw new Error(`关系「${broken.type}」指向不存在的人物。`);
  const interactions = Array.isArray(data.interactions) ? data.interactions.filter((item) => ids.has(item.personId)) : [];
  return {
    version: 2,
    people,
    relationships,
    interactions,
    positions: normalizePositions(people, data.positions ?? {}),
  };
}

function buildFollowupGroups(people: Person[]) {
  const todayDate = today();
  const weekEnd = addDays(7);
  const duePeople = people.filter((person) => person.nextFollowUpAt && person.followStatus !== "暂停");
  return {
    overdue: duePeople.filter((person) => person.nextFollowUpAt < todayDate).sort((a, b) => a.nextFollowUpAt.localeCompare(b.nextFollowUpAt)),
    today: duePeople.filter((person) => person.nextFollowUpAt === todayDate),
    thisWeek: duePeople.filter((person) => person.nextFollowUpAt > todayDate && person.nextFollowUpAt <= weekEnd).sort((a, b) => a.nextFollowUpAt.localeCompare(b.nextFollowUpAt)),
  };
}

function buildSuggestions(person: Person, relationships: Relationship[]) {
  const suggestions: string[] = [];
  const daysSinceContact = person.lastContactAt ? Math.floor((Date.now() - new Date(person.lastContactAt).getTime()) / 86400000) : null;
  if (person.nextFollowUpAt && person.nextFollowUpAt < today()) suggestions.push("跟进日期已逾期，建议优先联系。");
  if (daysSinceContact === null) suggestions.push("还没有互动记录，可以先补充一次初始联系。");
  if (daysSinceContact !== null && daysSinceContact > 30) suggestions.push(`已 ${daysSinceContact} 天未联系，适合做一次轻量维护。`);
  if (relationships.some((relationship) => relationship.type === "介绍人" || relationship.strength >= 4)) suggestions.push("存在强关系或介绍人关系，维护价值较高。");
  if (person.warmth <= 2) suggestions.push("关系温度偏低，建议先用低压力方式恢复联系。");
  return suggestions.length ? suggestions : ["状态健康，按计划维护即可。"];
}

function findShortestPath(fromId: string, toId: string, relationships: Relationship[]) {
  if (!fromId || !toId || fromId === toId) return null;
  const graph = new Map<string, { next: string; relationship: Relationship }[]>();
  relationships.forEach((relationship) => {
    graph.set(relationship.fromId, [...(graph.get(relationship.fromId) ?? []), { next: relationship.toId, relationship }]);
    if (!relationship.directed) graph.set(relationship.toId, [...(graph.get(relationship.toId) ?? []), { next: relationship.fromId, relationship }]);
  });
  const queue = [fromId];
  const visited = new Set([fromId]);
  const previous = new Map<string, { prev: string; relationship: Relationship }>();
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of graph.get(current) ?? []) {
      if (visited.has(edge.next)) continue;
      visited.add(edge.next);
      previous.set(edge.next, { prev: current, relationship: edge.relationship });
      if (edge.next === toId) {
        const peopleIds = [toId];
        const steps: { from: string; to: string; relationship: Relationship }[] = [];
        let cursor = toId;
        while (cursor !== fromId) {
          const item = previous.get(cursor)!;
          steps.unshift({ from: item.prev, to: cursor, relationship: item.relationship });
          peopleIds.unshift(item.prev);
          cursor = item.prev;
        }
        return { peopleIds, steps };
      }
      queue.push(edge.next);
    }
  }
  return null;
}

function findCommonContacts(fromId: string, toId: string, people: Person[], relationships: Relationship[]) {
  if (!fromId || !toId || fromId === toId) return [];
  const contacts = new Map<string, Set<string>>();
  relationships.forEach((relationship) => {
    if (!contacts.has(relationship.fromId)) contacts.set(relationship.fromId, new Set());
    if (!contacts.has(relationship.toId)) contacts.set(relationship.toId, new Set());
    contacts.get(relationship.fromId)!.add(relationship.toId);
    contacts.get(relationship.toId)!.add(relationship.fromId);
  });
  const fromContacts = contacts.get(fromId) ?? new Set<string>();
  const toContacts = contacts.get(toId) ?? new Set<string>();
  return people.filter((person) => fromContacts.has(person.id) && toContacts.has(person.id));
}

function buildAnalysis(people: Person[], relationships: Relationship[]) {
  const degree = new Map<string, number>(people.map((person) => [person.id, 0]));
  relationships.forEach((relationship) => {
    degree.set(relationship.fromId, (degree.get(relationship.fromId) ?? 0) + 1);
    degree.set(relationship.toId, (degree.get(relationship.toId) ?? 0) + 1);
  });
  const centralPeople = people.map((person) => ({ person, score: degree.get(person.id) ?? 0 })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
  const isolatedPeople = people.filter((person) => (degree.get(person.id) ?? 0) === 0);
  return {
    centralPeople,
    isolatedPeople,
    strongRelationships: relationships.filter((relationship) => relationship.strength >= 4).sort((a, b) => b.strength - a.strength),
  };
}

export { App };
