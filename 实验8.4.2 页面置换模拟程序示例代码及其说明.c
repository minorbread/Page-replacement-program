#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define VM_PAGE 32	//虚页面数，共32
#define PM_PAGE	4	//物理页面数，共4
#define TOTAL_INSTR 320	//指令条数，320
#define INSTR_PER_PAGE	10	//每页指令数
#define OPT		1	//最佳算法
#define FIFO	2	//先进先出算法
#define LRU		3	//最近很少使用算法

//页表项数据结构
typedef struct{
	int vmn;	//虚页号
	int pmn;	//虚页号所对应的实页号
	int exist;	//存在位，是否已经在物理内存中
	int time;	//最近访问时间，LRU中用于统计最近访问时间，
				//FIFO中用于统计第一次进入物理内存时间
}vpage_item;
//页表，总数为VM_PAGE
vpage_item page_table[VM_PAGE];
//物理页位图，存放当前正在物理内存中的页表项的指针
vpage_item*	ppage_bitmap[PM_PAGE];

//每条指令信息
typedef struct{
	int num;	//指令号
	int vpage;	//所属虚页
	int	offset;	//页内偏移
	int inflow;//指令流中是否已包含该指令，用于构建指令流
}instr_item;
//指令数组
instr_item instr_array[TOTAL_INSTR];
//指令流数据结构
struct instr_flow{
	instr_item *instr;
	struct instr_flow *next;
};
//指令流头数据结构
struct instr_flow_head{
	int num;//指令流中指令数；
	struct instr_flow *next;//指向下一条指令
};
struct instr_flow_head iflow_head;

int pfail_num = 0;//缺页数
int cur_replace_alg = 1;//当前置换算法，默认为OPT

void init_data();
void reset_page_table();
int add_to_flow(int n);
int gen_instr_flow();
int alloc_PPage(struct instr_flow *cur, int chip);
void run();
int opt(struct instr_flow *cur);
int fifo(struct instr_flow *cur);
int lru(struct instr_flow *cur);
void clean();

int main()
{
	//初始化数据
	init_data();
	//产生指令流
	gen_instr_flow();
	printf("---------The result of OPT-----------------\n");
	//使用OPT算法模拟
	cur_replace_alg = OPT;
	run();
	printf("---------The result of FIFO-----------------\n");
	//使用FIFO算法模拟
	cur_replace_alg = FIFO;
	reset_page_table();
	run();
	printf("---------The result of LRU-----------------\n");
	//使用LRU算法模拟
	cur_replace_alg = LRU;
	reset_page_table();
	run();
	
	clean();
}

//数据初始化
void init_data()
{
	int i = 0;
	//虚页表初始化
	for(i = 0; i < VM_PAGE; i++){
		page_table[i].vmn = i;
		page_table[i].pmn = 0;
		page_table[i].exist = 0;
		page_table[i].time = -1;
	}
	//物理页位图初始化
	for(i = 0; i < PM_PAGE; i++){
		ppage_bitmap[i] = NULL;//没有被使用
	}
	//指令数组初始化
	for(i = 0; i < TOTAL_INSTR; i++){
		instr_array[i].num = i;
		instr_array[i].vpage = i / INSTR_PER_PAGE;
		instr_array[i].offset = i % INSTR_PER_PAGE;
		instr_array[i].inflow = 0;
	}
	//指令流头初始化
	iflow_head.num = 0;
	iflow_head.next = NULL;
	
	pfail_num = 0;
}

//重置页表信息，当使用一种算法模拟后，如再使用第二种算法模拟，
//需重置页表，但保留指令流初始化信息，这样，多种算法可以使用
//一个指令流来进行比较
void reset_page_table()
{
	int i = 0;
	//虚页表初始化
	for(i = 0; i < VM_PAGE; i++){
		page_table[i].vmn = i;
		page_table[i].pmn = 0;
		page_table[i].exist = 0;
		page_table[i].time = -1;
	}
	//物理页位图初始化
	for(i = 0; i < PM_PAGE; i++){
		ppage_bitmap[i] = NULL;//没有被使用
	}
	pfail_num = 0;
}

//将第n条指令加入到指令流链表尾部
//如该指令在指令流中不存在，返回1，否则返回0
int add_to_flow(int n) 
{
	int ret = 0;
	struct instr_flow *tail = NULL;
	struct instr_flow *ptr = NULL;
	
	//创建一个链表元素
	tail = (struct instr_flow*)malloc(sizeof(struct instr_flow));
	tail->instr = &instr_array[n];
	tail->next = NULL;
	//判断返回值，如指令流中已有该指令，返回值为0，否则返回1
	if(instr_array[n].inflow == 0){
		instr_array[n].inflow = 1;
		ret = 1;
	}
	//将指令加入链表，当指令流头为空时，直接加到指令流头后面
	//否则，将其加入到链表最后面
	if(iflow_head.num == 0 && iflow_head.next == NULL){
		iflow_head.next = tail;
	}else{
		ptr = iflow_head.next;
		//寻找指令流尾部
		while(ptr->next != NULL){
			ptr = ptr->next;
		}
		ptr->next = tail;
	}
	iflow_head.num += 1;

	return ret;
}

//按照规则生成指令流，一条指令可能在指令流中多次出现，
//因此，生成的指令流应大于等于TOTAL_INSTRUCTION
//返回生成的指令流中，指令总条数
int gen_instr_flow()
{
	//指令流中非重复指令个数
	int total = 0;
	int s;
	
	srand((int)getpid());	//根据PID给随机种子
	//随机产生一条开始指令
	s = (int)rand() % TOTAL_INSTR;
	total += add_to_flow(s);
	//如果s不是最后一条，顺序执行下一条指令
	if(s < TOTAL_INSTR - 1){
		total += add_to_flow(s+1);
	}
	//重复：跳转到前地址部分、顺序执行、跳转到后地址部分、顺序执行
	while(total < TOTAL_INSTR){
		//如果s不是0，则跳转到前地址部分[0, s-1]，然后顺序执行
		if(s > 0){
			s = (int)rand() % s;//产生[0,s)的随机数
			total += add_to_flow(s);
			//如果s不是最后一条，顺序执行下一条指令
			if(s < TOTAL_INSTR - 1){
				total += add_to_flow(s+1);
			}
		}
		//如果s+1不是最后一条，则跳转到后地址部分[s+2, 319],然后顺序执行
		if(s < TOTAL_INSTR - 2){
			//产生[s+2,320)的随机数
			s = (int)rand() % (TOTAL_INSTR - s - 2) + (s + 2);
			total += add_to_flow(s);
			//如果s不是最后一条，顺序执行下一条指令
			if(s < TOTAL_INSTR - 1){
				total += add_to_flow(s+1);
			}
		}
	}
	//返回指令流中指令数
	return iflow_head.num;
}

//为当前指令分配物理页，返回物理页号，并更新页表及物理页表位图
//chip：当前时刻
int alloc_PPage(struct instr_flow *cur, int chip)
{
	int i;
	int ppage = -1;
	int vpage = cur->instr->vpage;
	//通过物理页表位图，寻找是否有未用的物理位图
	for(i = 0; i < PM_PAGE; i++){
		if(ppage_bitmap[i] == NULL){
			ppage = i;
			break;
		}
	}
	//如果没有直接可用的物理内存，需要置换
	if(ppage == -1){
		switch (cur_replace_alg)
		{
			case OPT:
				ppage = opt(cur);
				break;
			case  FIFO:
				ppage = fifo(cur);
				break;
			case LRU:
				ppage = lru(cur);
				break;
			default:
				ppage = opt(cur);
				break;
		}
	}
	//更新页表中pmn以及exist，time属性根据置换算法类型修改
	page_table[vpage].pmn = ppage;//对应的实页号
	page_table[vpage].exist = 1;//存在位 置1
	switch (cur_replace_alg)
	{
		case OPT:
			break;
		case  FIFO:
			//该页首次进入内存时才更新
			if(page_table[vpage].time == -1){
				page_table[vpage].time = chip;
			}
			break;
		case LRU:
			page_table[vpage].time = chip;
			break;
		default:
			break;
	}
	//更新物理位图中的信息
	if(ppage_bitmap[ppage]){//更新被置换出去的页表信息
		ppage_bitmap[ppage]->exist = 0;
		ppage_bitmap[ppage]->time = -1;
	}
	//物理位图当前指针更新为新的页表项
	ppage_bitmap[ppage] = &page_table[vpage];
	return ppage;
}

//运行程序，在发生页面置换时，根据当前置换算法选择置换页面
void run()
{
	int vpage, offset, ppage;
	int chip = 0;
	
	struct instr_flow *cur = iflow_head.next;//指令流中当前指令
	while(cur != NULL){
		//首先判断该指令是否物理内存中
		vpage = cur->instr->vpage;
		offset = cur->instr->offset;
		//如果该指令不在物理内存中
		if(page_table[vpage].exist == 0){
			//为其分配物理内存
			ppage = alloc_PPage(cur, chip);
			//计算缺页率
			pfail_num += 1;
		}else{
			//如果已经在内存中，根据置换算法更新页表项中time信息
			//三种算法中，仅LRU需要更新
			switch(cur_replace_alg){
				case LRU:
					page_table[vpage].time = chip;
					break;
				case OPT:
				case FIFO:
				default:
					break;
			}
		}
		//打印该指令物理地址
		//printf("%d\t", ppage * 10 + offset); 
		cur = cur->next;
		chip ++;
	}
	printf("page fault ratio is %f\n", (float)pfail_num/(float)iflow_head.num);
}
//最优置换算法opt，寻找需要替换的页
int opt(struct instr_flow *cur)
{
	int found = 0;
	int ppage_hash[PM_PAGE];
	struct instr_flow *ptr = cur->next;
	int vpage, ppage, exist, i, ret;
	memset(ppage_hash, 0, sizeof(int)*PM_PAGE);
	//搜索指令流，判断哪个在物理内存中的虚页最久才被使用
	while(ptr != NULL && found < PM_PAGE - 1){
		vpage = ptr->instr->vpage;
		ppage = page_table[vpage].pmn;
		exist = page_table[vpage].exist;
		if(exist && ppage_hash[ppage] == 0){
			ppage_hash[ppage] = 1;
			found += 1;
		}
		ptr = ptr->next;
	}
	//搜索ppage_hash，第一个为0的物理页面，是需要被置换的
	for(i = 0; i < PM_PAGE; i++){
		if(ppage_hash[i] == 0){
			ret = i;
			break;
		}
	}
	return ret;
}
//LRU置换算法，从ppage_bitmap中找time值最小的页面(最久未被使用)置换出去
int lru(struct instr_flow *cur)
{
	int min_time = 1000000, ppage=-1, i;
	for(i = 0; i < PM_PAGE; i++){
		if(ppage_bitmap[i] && ppage_bitmap[i]->time < min_time){
			min_time = ppage_bitmap[i]->time;
			ppage = i;
		}
	}
	return ppage;
}
//fifo置换算法，从ppage_bitmap中找time值最小的页面（最早到来）置换出去
int fifo(struct instr_flow *cur)
{
	int min_time = 1000000, ppage=-1, i;
	for(i = 0; i < PM_PAGE; i++){
		if(ppage_bitmap[i] && ppage_bitmap[i]->time < min_time){
			min_time = ppage_bitmap[i]->time;
			ppage = i;
		}
	}
	return ppage;
}

//释放指令流数据结构
void clean()
{
		struct instr_flow *ptr = NULL, *cur = NULL;
		ptr = cur = iflow_head.next;

		while(ptr != NULL){
			cur = ptr;
			ptr = ptr->next;
			free(cur);
		}
}